import { createFileRoute, Link } from "@tanstack/react-router";
import { useClaudeSessions } from "@/contexts/ClaudeSessionsContext";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  FolderOpen,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/integrations/claude")({
  component: ClaudeIntegrationPage,
});

function getProjectLabel(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

function ClaudeIntegrationPage() {
  const {
    projects,
    sessions,
    selectedProjects,
    loading,
    error,
    refreshProjects,
    toggleProject,
    clearProjects,
    refreshSessions,
  } = useClaudeSessions();

  const isConnected = selectedProjects.length > 0;

  return (
    <div className="min-h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            to="/integrations"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-2 inline-block"
          >
            &larr; Back to integrations
          </Link>
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8 text-orange-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Claude Code
            </h1>
          </div>
        </div>

        <div className="space-y-6">
          <ProjectSelectorCard
            projects={projects}
            selectedProjects={selectedProjects}
            loading={loading}
            error={error}
            onRefresh={refreshProjects}
            onToggleProject={toggleProject}
            onClearProjects={clearProjects}
          />

          {isConnected && (
            <SessionsCard
              sessions={sessions}
              loading={loading}
              projectCount={selectedProjects.length}
              onRefresh={refreshSessions}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type ProjectSelectorCardProps = {
  projects: string[];
  selectedProjects: string[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onToggleProject: (projectPath: string) => void;
  onClearProjects: () => void;
};

function ProjectSelectorCard({
  projects,
  selectedProjects,
  loading,
  error,
  onRefresh,
  onToggleProject,
  onClearProjects,
}: ProjectSelectorCardProps) {
  const hasSelection = selectedProjects.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Project Selection
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRefresh()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          Select Claude Code projects to sync sessions to Activity Stream.
          Projects are detected from ~/.claude/projects/
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Selected Projects</span>
          </div>
          {hasSelection ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                {selectedProjects.length} selected
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-600 dark:text-amber-400">
                Not selected
              </span>
            </div>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              No Claude Code projects found. Use Claude Code CLI in a project
              directory to create sessions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  disabled={loading}
                >
                  <span className="truncate">
                    {hasSelection
                      ? `${selectedProjects.length} projects selected`
                      : "Select projects..."}
                  </span>
                  <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-[300px] overflow-y-auto">
                {projects.map((project) => (
                  <DropdownMenuCheckboxItem
                    key={project}
                    checked={selectedProjects.includes(project)}
                    onCheckedChange={() => onToggleProject(project)}
                    onSelect={(event) => event.preventDefault()}
                    className="flex flex-col items-start gap-0"
                  >
                    <span className="font-medium">
                      {getProjectLabel(project)}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-full">
                      {project}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                {hasSelection && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onClearProjects}>
                      Clear selection
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {hasSelection && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Connected to {selectedProjects.length} project
                  {selectedProjects.length === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedProjects.map((project) => (
                    <Badge
                      key={project}
                      variant="secondary"
                      className="text-xs"
                      title={project}
                    >
                      {getProjectLabel(project)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

type SessionsCardProps = {
  sessions: ReturnType<typeof useClaudeSessions>["sessions"];
  loading: boolean;
  projectCount: number;
  onRefresh: () => void;
};

function SessionsCard({
  sessions,
  loading,
  projectCount,
  onRefresh,
}: SessionsCardProps) {
  const recentSessions = sessions.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Recent Sessions
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          {sessions.length} total sessions across {projectCount} project
          {projectCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No sessions found in selected projects
          </p>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => {
              const timeAgo = formatDistanceToNow(new Date(session.timestamp), {
                addSuffix: true,
              });

              return (
                <div
                  key={session.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {session.summary || "Untitled Session"}
                      </span>
                    </div>
                    {session.firstMessage && (
                      <p className="text-xs text-muted-foreground line-clamp-2 ml-6">
                        {session.firstMessage}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 ml-6">
                      <Badge variant="secondary" className="text-xs">
                        {session.messageCount} messages
                      </Badge>
                      {session.projectPath && (
                        <Badge variant="outline" className="text-xs">
                          {getProjectLabel(session.projectPath)}
                        </Badge>
                      )}
                      {session.gitBranch && (
                        <Badge variant="outline" className="text-xs">
                          {session.gitBranch}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {sessions.length > 10 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing 10 of {sessions.length} sessions
          </p>
        )}
      </CardContent>
    </Card>
  );
}
