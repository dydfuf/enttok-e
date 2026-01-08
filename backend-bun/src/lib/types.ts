import type { Context, Hono } from "hono";

// Environment bindings (for Hono's generic types)
export type Env = {
  Variables: {
    token: string | undefined;
  };
};

// App type
export type App = Hono<Env>;

// Context type with our custom variables
export type AppContext = Context<Env>;
