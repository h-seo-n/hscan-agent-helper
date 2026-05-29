// vite.config.ts
import { defineConfig } from "file:///Users/hjpark/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/26SS/%E1%84%8E%E1%85%A1%E1%86%BC%E1%84%8B%E1%85%B4%E1%84%8C%E1%85%A5%E1%86%A8%E1%84%90%E1%85%A9%E1%86%BC%E1%84%92%E1%85%A1%E1%86%B8%E1%84%89%E1%85%A5%E1%86%AF%E1%84%80%E1%85%A8/hscan-agent-helper/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.39/node_modules/vite/dist/node/index.js";
import react from "file:///Users/hjpark/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/26SS/%E1%84%8E%E1%85%A1%E1%86%BC%E1%84%8B%E1%85%B4%E1%84%8C%E1%85%A5%E1%86%A8%E1%84%90%E1%85%A9%E1%86%BC%E1%84%92%E1%85%A1%E1%86%B8%E1%84%89%E1%85%A5%E1%86%AF%E1%84%80%E1%85%A8/hscan-agent-helper/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@20.19.39_/node_modules/@vitejs/plugin-react/dist/index.js";
import { crx } from "file:///Users/hjpark/Library/Mobile%20Documents/com%7Eapple%7ECloudDocs/26SS/%E1%84%8E%E1%85%A1%E1%86%BC%E1%84%8B%E1%85%B4%E1%84%8C%E1%85%A5%E1%86%A8%E1%84%90%E1%85%A9%E1%86%BC%E1%84%92%E1%85%A1%E1%86%B8%E1%84%89%E1%85%A5%E1%86%AF%E1%84%80%E1%85%A8/hscan-agent-helper/node_modules/.pnpm/@crxjs+vite-plugin@2.4.0_vite@5.4.21_@types+node@20.19.39_/node_modules/@crxjs/vite-plugin/dist/index.mjs";
import path from "node:path";

// manifest.json
var manifest_default = {
  manifest_version: 3,
  name: "Hscan AI Web Assistant",
  version: "0.1.0",
  description: "AI-powered in-page web assistant",
  minimum_chrome_version: "116",
  action: {
    default_title: "Open Hscan Sidebar"
  },
  side_panel: {
    default_path: "src/sidebar/index.html"
  },
  permissions: ["sidePanel", "scripting", "activeTab", "storage"],
  host_permissions: ["<all_urls>", "http://localhost:5174/*"],
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["<all_urls>", "http://localhost:5174/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle"
    }
  ]
};

// vite.config.ts
var __vite_injected_original_dirname = "/Users/hjpark/Library/Mobile Documents/com~apple~CloudDocs/26SS/\u110E\u1161\u11BC\u110B\u1174\u110C\u1165\u11A8\u1110\u1169\u11BC\u1112\u1161\u11B8\u1109\u1165\u11AF\u1100\u1168/hscan-agent-helper/packages/extension";
var vite_config_default = defineConfig({
  plugins: [react(), crx({ manifest: manifest_default })],
  resolve: {
    alias: {
      "@hscan/shared-types": path.resolve(__vite_injected_original_dirname, "../shared-types/src/index.ts")
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  },
  build: {
    target: "es2022",
    sourcemap: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAibWFuaWZlc3QuanNvbiJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9oanBhcmsvTGlicmFyeS9Nb2JpbGUgRG9jdW1lbnRzL2NvbX5hcHBsZX5DbG91ZERvY3MvMjZTUy9cdTExMEVcdTExNjFcdTExQkNcdTExMEJcdTExNzRcdTExMENcdTExNjVcdTExQThcdTExMTBcdTExNjlcdTExQkNcdTExMTJcdTExNjFcdTExQjhcdTExMDlcdTExNjVcdTExQUZcdTExMDBcdTExNjgvaHNjYW4tYWdlbnQtaGVscGVyL3BhY2thZ2VzL2V4dGVuc2lvblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2hqcGFyay9MaWJyYXJ5L01vYmlsZSBEb2N1bWVudHMvY29tfmFwcGxlfkNsb3VkRG9jcy8yNlNTL1x1MTEwRVx1MTE2MVx1MTFCQ1x1MTEwQlx1MTE3NFx1MTEwQ1x1MTE2NVx1MTFBOFx1MTExMFx1MTE2OVx1MTFCQ1x1MTExMlx1MTE2MVx1MTFCOFx1MTEwOVx1MTE2NVx1MTFBRlx1MTEwMFx1MTE2OC9oc2Nhbi1hZ2VudC1oZWxwZXIvcGFja2FnZXMvZXh0ZW5zaW9uL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9oanBhcmsvTGlicmFyeS9Nb2JpbGUlMjBEb2N1bWVudHMvY29tJTdFYXBwbGUlN0VDbG91ZERvY3MvMjZTUy8lRTElODQlOEUlRTElODUlQTElRTElODYlQkMlRTElODQlOEIlRTElODUlQjQlRTElODQlOEMlRTElODUlQTUlRTElODYlQTglRTElODQlOTAlRTElODUlQTklRTElODYlQkMlRTElODQlOTIlRTElODUlQTElRTElODYlQjglRTElODQlODklRTElODUlQTUlRTElODYlQUYlRTElODQlODAlRTElODUlQTgvaHNjYW4tYWdlbnQtaGVscGVyL3BhY2thZ2VzL2V4dGVuc2lvbi92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcbmltcG9ydCB7IGNyeCB9IGZyb20gJ0Bjcnhqcy92aXRlLXBsdWdpbic7XG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IG1hbmlmZXN0IGZyb20gJy4vbWFuaWZlc3QuanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgY3J4KHsgbWFuaWZlc3QgfSldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAaHNjYW4vc2hhcmVkLXR5cGVzJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uL3NoYXJlZC10eXBlcy9zcmMvaW5kZXgudHMnKSxcbiAgICB9LFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgaG1yOiB7XG4gICAgICBwb3J0OiA1MTczLFxuICAgIH0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgdGFyZ2V0OiAnZXMyMDIyJyxcbiAgICBzb3VyY2VtYXA6IHRydWUsXG4gIH0sXG59KTtcbiIsICJ7XG4gIFwibWFuaWZlc3RfdmVyc2lvblwiOiAzLFxuICBcIm5hbWVcIjogXCJIc2NhbiBBSSBXZWIgQXNzaXN0YW50XCIsXG4gIFwidmVyc2lvblwiOiBcIjAuMS4wXCIsXG4gIFwiZGVzY3JpcHRpb25cIjogXCJBSS1wb3dlcmVkIGluLXBhZ2Ugd2ViIGFzc2lzdGFudFwiLFxuICBcIm1pbmltdW1fY2hyb21lX3ZlcnNpb25cIjogXCIxMTZcIixcbiAgXCJhY3Rpb25cIjoge1xuICAgIFwiZGVmYXVsdF90aXRsZVwiOiBcIk9wZW4gSHNjYW4gU2lkZWJhclwiXG4gIH0sXG4gIFwic2lkZV9wYW5lbFwiOiB7XG4gICAgXCJkZWZhdWx0X3BhdGhcIjogXCJzcmMvc2lkZWJhci9pbmRleC5odG1sXCJcbiAgfSxcbiAgXCJwZXJtaXNzaW9uc1wiOiBbXCJzaWRlUGFuZWxcIiwgXCJzY3JpcHRpbmdcIiwgXCJhY3RpdmVUYWJcIiwgXCJzdG9yYWdlXCJdLFxuICBcImhvc3RfcGVybWlzc2lvbnNcIjogW1wiPGFsbF91cmxzPlwiLCBcImh0dHA6Ly9sb2NhbGhvc3Q6NTE3NC8qXCJdLFxuICBcImJhY2tncm91bmRcIjoge1xuICAgIFwic2VydmljZV93b3JrZXJcIjogXCJzcmMvYmFja2dyb3VuZC9pbmRleC50c1wiLFxuICAgIFwidHlwZVwiOiBcIm1vZHVsZVwiXG4gIH0sXG4gIFwiY29udGVudF9zY3JpcHRzXCI6IFtcbiAgICB7XG4gICAgICBcIm1hdGNoZXNcIjogW1wiPGFsbF91cmxzPlwiLCBcImh0dHA6Ly9sb2NhbGhvc3Q6NTE3NC8qXCJdLFxuICAgICAgXCJqc1wiOiBbXCJzcmMvY29udGVudC9pbmRleC50c1wiXSxcbiAgICAgIFwicnVuX2F0XCI6IFwiZG9jdW1lbnRfaWRsZVwiXG4gICAgfVxuICBdXG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTJyQixTQUFTLG9CQUFvQjtBQUN4dEIsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsV0FBVztBQUNwQixPQUFPLFVBQVU7OztBQ0hqQjtBQUFBLEVBQ0Usa0JBQW9CO0FBQUEsRUFDcEIsTUFBUTtBQUFBLEVBQ1IsU0FBVztBQUFBLEVBQ1gsYUFBZTtBQUFBLEVBQ2Ysd0JBQTBCO0FBQUEsRUFDMUIsUUFBVTtBQUFBLElBQ1IsZUFBaUI7QUFBQSxFQUNuQjtBQUFBLEVBQ0EsWUFBYztBQUFBLElBQ1osY0FBZ0I7QUFBQSxFQUNsQjtBQUFBLEVBQ0EsYUFBZSxDQUFDLGFBQWEsYUFBYSxhQUFhLFNBQVM7QUFBQSxFQUNoRSxrQkFBb0IsQ0FBQyxjQUFjLHlCQUF5QjtBQUFBLEVBQzVELFlBQWM7QUFBQSxJQUNaLGdCQUFrQjtBQUFBLElBQ2xCLE1BQVE7QUFBQSxFQUNWO0FBQUEsRUFDQSxpQkFBbUI7QUFBQSxJQUNqQjtBQUFBLE1BQ0UsU0FBVyxDQUFDLGNBQWMseUJBQXlCO0FBQUEsTUFDbkQsSUFBTSxDQUFDLHNCQUFzQjtBQUFBLE1BQzdCLFFBQVU7QUFBQSxJQUNaO0FBQUEsRUFDRjtBQUNGOzs7QUR6QkEsSUFBTSxtQ0FBbUM7QUFNekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxJQUFJLEVBQUUsMkJBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDcEMsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsdUJBQXVCLEtBQUssUUFBUSxrQ0FBVyw4QkFBOEI7QUFBQSxJQUMvRTtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLEtBQUs7QUFBQSxNQUNILE1BQU07QUFBQSxJQUNSO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLEVBQ2I7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
