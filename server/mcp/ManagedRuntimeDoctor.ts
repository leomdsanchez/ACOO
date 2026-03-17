export function getManagedRuntimeDoctorCommand(name: string): string | null {
  switch (name) {
    case "playwright":
      return "npm run server:mcp -- doctor playwright --pretty";
    default:
      return null;
  }
}
