declare global {
  interface Window {
    __arrnba?: {
      threads: Map<string, any>;
      comments: Map<string, any[]>;
      mapping?: Record<string, any>;
    };
  }
}

export {};
