export const FEATURES = {
  manage_templates: "manage_templates",
  upload_logo: "upload_logo",
  "export_one_csv": "export_one_csv",
  "export_search_csv": "export_search_csv",
  "export_selected_csv": "export_selected_csv",
  "issue_certificate": "issue_certificate",
  "pdf_one": "pdf_one",
  "pdf_zip": "pdf_zip",
  "manage_stores": "manage_stores",
} as const;

export type FeatureId = keyof typeof FEATURES;
export const FEATURE_LIST = Object.keys(FEATURES) as FeatureId[];
