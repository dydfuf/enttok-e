import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Github, Slack, SquareKanban } from "lucide-react";

export const Route = createFileRoute("/_app/integrations/")({
  component: IntegrationsIndexPage,
});

const integrations = [
  {
    id: "github",
    name: "GitHub",
    description: "Sync PRs, issues, commits, and reviews",
    icon: Github,
    connected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Coming soon - Sync messages and mentions",
    icon: Slack,
    connected: false,
    disabled: true,
  },
  {
    id: "jira",
    name: "Jira",
    description: "Coming soon - Sync issues and sprints",
    icon: SquareKanban,
    connected: false,
    disabled: true,
  },
];

function IntegrationsIndexPage() {
  return (
    <div className="h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Integrations
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Connect external services to get activity-based suggestions
          </p>
        </div>

        <div className="space-y-4">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <Card
                key={integration.id}
                className={integration.disabled ? "opacity-50" : ""}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-4">
                    <Icon className="w-8 h-8 text-muted-foreground" />
                    <div className="flex-1">
                      <CardTitle className="text-base">
                        {integration.name}
                      </CardTitle>
                      <CardDescription>{integration.description}</CardDescription>
                    </div>
                    {!integration.disabled && (
                      <Button asChild>
                        <Link to="/integrations/github">
                          {integration.connected ? "Manage" : "Connect"}
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
