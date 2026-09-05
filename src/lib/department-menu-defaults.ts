export const DEPARTMENT_MENU_DEFAULTS: Record<string, {
  subMenus: string[];
  rightMenuOverrides?: Record<string, string[]>;
}> = {
  sale: {
    subMenus: ["pipeline", "quotation", "contact", "product"],
  },
  marketing: {
    subMenus: ["pipeline", "contact"],
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
