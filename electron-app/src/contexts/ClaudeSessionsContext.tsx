import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ClaudeSession } from "@/shared/electron-api";
import { getElectronAPI } from "@/lib/electron";

type ClaudeSessionsContextValue = {
  projects: string[];
  sessions: ClaudeSession[];
  selectedProjects: string[];
  loading: boolean;
  error: string | null;
  refreshProjects: () => Promise<string[] | undefined>;
  toggleProject: (projectPath: string) => Promise<void>;
  clearProjects: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  getSessionsForDate: (date: string) => Promise<ClaudeSession[]>;
};

const ClaudeSessionsContext = createContext<ClaudeSessionsContextValue | null>(
  null
);

function normalizeProjectList(paths: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of paths) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function mergeProjectLists(primary: string[], extra: string[]): string[] {
  return normalizeProjectList([...primary, ...extra]);
}

export function ClaudeSessionsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<string[]>([]);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const electronAPI = useMemo(() => getElectronAPI(), []);

  const refreshProjects = useCallback(async () => {
    if (!electronAPI) {
      setError("electronAPI unavailable");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const projectList = await electronAPI.listClaudeProjects();
      const mergedProjects = mergeProjectLists(projectList, selectedProjects);
      setProjects(mergedProjects);
      return mergedProjects;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to list Claude projects"
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [electronAPI, selectedProjects]);

  const fetchSessionsForProjects = useCallback(
    async (projectPaths: string[]) => {
      if (!electronAPI) {
        return { projects: [], sessions: [], errors: ["electronAPI unavailable"] };
      }
      const uniqueProjects = normalizeProjectList(projectPaths);
      if (uniqueProjects.length === 0) {
        return { projects: [], sessions: [], errors: [] };
      }

      const results = await Promise.all(
        uniqueProjects.map((projectPath) =>
          electronAPI.listClaudeSessions(projectPath)
        )
      );

      const sessions: ClaudeSession[] = [];
      const errors: string[] = [];
      const resolvedProjects = uniqueProjects.map((projectPath, index) => {
        const result = results[index];
        if (!result.success) {
          errors.push(result.error || "Failed to list Claude sessions");
          return projectPath;
        }
        sessions.push(...result.sessions);
        return result.projectPath ?? projectPath;
      });

      sessions.sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
      );

      return {
        projects: normalizeProjectList(resolvedProjects),
        sessions,
        errors,
      };
    },
    [electronAPI]
  );

  const updateSelection = useCallback(
    async (projectPaths: string[]) => {
      if (!electronAPI) {
        setError("electronAPI unavailable");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const normalized = normalizeProjectList(projectPaths);
        if (normalized.length === 0) {
          await electronAPI.setClaudeProjectPaths([]);
          setSelectedProjects([]);
          setSessions([]);
          return;
        }

        const { projects: resolvedProjects, sessions, errors } =
          await fetchSessionsForProjects(normalized);

        setSelectedProjects(resolvedProjects);
        setSessions(sessions);
        setProjects((prev) => mergeProjectLists(prev, resolvedProjects));
        await electronAPI.setClaudeProjectPaths(resolvedProjects);

        if (errors.length > 0) {
          setError(errors[0]);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update Claude projects"
        );
      } finally {
        setLoading(false);
      }
    },
    [electronAPI, fetchSessionsForProjects]
  );

  const toggleProject = useCallback(
    async (projectPath: string) => {
      const isSelected = selectedProjects.includes(projectPath);
      const nextProjects = isSelected
        ? selectedProjects.filter((path) => path !== projectPath)
        : [...selectedProjects, projectPath];
      await updateSelection(nextProjects);
    },
    [selectedProjects, updateSelection]
  );

  const clearProjects = useCallback(async () => {
    if (!electronAPI) {
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedProjects([]);
    setSessions([]);

    try {
      await electronAPI.setClaudeProjectPaths([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear projects"
      );
    } finally {
      setLoading(false);
    }
  }, [electronAPI]);

  const refreshSessions = useCallback(async () => {
    if (selectedProjects.length === 0) {
      return;
    }
    await updateSelection(selectedProjects);
  }, [selectedProjects, updateSelection]);

  const getSessionsForDate = useCallback(
    async (date: string): Promise<ClaudeSession[]> => {
      if (!electronAPI || selectedProjects.length === 0) {
        return [];
      }

      try {
        const results = await Promise.all(
          selectedProjects.map((projectPath) =>
            electronAPI.getClaudeSessionsForDate(projectPath, date)
          )
        );
        const sessions = results.flat();
        sessions.sort(
          (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
        );
        return sessions;
      } catch {
        return [];
      }
    },
    [electronAPI, selectedProjects]
  );

  // Initialize: load stored project paths and projects list
  useEffect(() => {
    if (initialized || !electronAPI) {
      return;
    }

    const initialize = async () => {
      setLoading(true);
      setError(null);

      try {
        const [projectList, storedPaths] = await Promise.all([
          electronAPI.listClaudeProjects(),
          electronAPI.getClaudeProjectPaths(),
        ]);

        let resolvedProjects: string[] = [];
        let resolvedSessions: ClaudeSession[] = [];
        let errors: string[] = [];

        if (storedPaths.length > 0) {
          const result = await fetchSessionsForProjects(storedPaths);
          resolvedProjects = result.projects;
          resolvedSessions = result.sessions;
          errors = result.errors;
          await electronAPI.setClaudeProjectPaths(resolvedProjects);
        }

        setSelectedProjects(resolvedProjects);
        setSessions(resolvedSessions);
        setProjects(mergeProjectLists(projectList, resolvedProjects));

        if (errors.length > 0) {
          setError(errors[0]);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize"
        );
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initialize();
  }, [electronAPI, fetchSessionsForProjects, initialized]);

  const value = useMemo(
    () => ({
      projects,
      sessions,
      selectedProjects,
      loading,
      error,
      refreshProjects,
      toggleProject,
      clearProjects,
      refreshSessions,
      getSessionsForDate,
    }),
    [
      projects,
      sessions,
      selectedProjects,
      loading,
      error,
      refreshProjects,
      toggleProject,
      clearProjects,
      refreshSessions,
      getSessionsForDate,
    ]
  );

  return (
    <ClaudeSessionsContext.Provider value={value}>
      {children}
    </ClaudeSessionsContext.Provider>
  );
}

export function useClaudeSessions() {
  const context = useContext(ClaudeSessionsContext);
  if (!context) {
    throw new Error(
      "useClaudeSessions must be used within ClaudeSessionsProvider"
    );
  }
  return context;
}
