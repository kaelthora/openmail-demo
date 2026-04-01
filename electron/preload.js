const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("openmailDesktop", {
  platform: process.platform,
  isDesktop: true,
});

