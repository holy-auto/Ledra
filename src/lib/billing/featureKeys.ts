export const FEATURES = {
  manage_templates: "manage_templates",
  upload_logo: "upload_logo",
} as const;

export type FeatureId = keyof typeof FEATURES;
export const FEATURE_LIST = Object.keys(FEATURES) as FeatureId[];
