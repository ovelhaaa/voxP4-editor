/// <reference types="vite/client" />

declare module '*voxp4-preview.mjs' {
  const createModule: (options?: any) => Promise<any>;
  export default createModule;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
