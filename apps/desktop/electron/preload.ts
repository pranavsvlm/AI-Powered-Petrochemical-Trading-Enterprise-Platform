import { contextBridge } from 'electron';

// Placeholder bridge — no APIs exposed yet.
contextBridge.exposeInMainWorld('platform', {});
