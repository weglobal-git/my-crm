export const DEPARTMENT_MENU_DEFAULTS: Record<string, {
  subMenus: string[];
  rightMenuOverrides?: Record<string, string[]>;
}> = {
  sale: {
    subMenus: ["pipeline", "quotation", "customers", "product"],
  },
  marketing: {
    subMenus: ["pipeline", "customers"],
    rightMenuOverrides: {
      pipeline: ["pipeline.activity", "pipeline.collaborate", "pipeline.images"],
    },
  },
  maintenance: {
    subMenus: ["pipeline"],
    rightMenuOverrides: {
      pipeline: ["pipeline.activity", "pipeline.collaborate", "pipeline.notes"],
    },
  },
};
