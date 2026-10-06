// CRM tools shown on the Integrations page, roughly in order of popularity. Logos live in
// public/integrations/<id>.webp and are the owners' own marks, shown only to identify each tool.
// None of these are connected yet: the page labels every one "Coming soon".
export interface CrmTool {
  id: string;
  name: string;
  tagline: string;
}

export const CRM_TOOLS: CrmTool[] = [
  { id: 'salesforce', name: 'Salesforce', tagline: 'The enterprise CRM' },
  { id: 'hubspot', name: 'HubSpot', tagline: 'Sales and marketing in one place' },
  { id: 'zoho', name: 'Zoho CRM', tagline: 'CRM from the Zoho suite' },
  { id: 'pipedrive', name: 'Pipedrive', tagline: 'Pipeline-first sales CRM' },
  { id: 'dynamics', name: 'Microsoft Dynamics 365', tagline: "Microsoft's sales platform" },
  { id: 'monday', name: 'monday CRM', tagline: 'CRM on monday.com' },
  { id: 'freshsales', name: 'Freshsales', tagline: 'Sales CRM from Freshworks' },
  { id: 'close', name: 'Close', tagline: 'CRM built for calling' },
  { id: 'copper', name: 'Copper', tagline: 'CRM for Google Workspace' },
  { id: 'attio', name: 'Attio', tagline: 'A flexible, modern CRM' },
  { id: 'insightly', name: 'Insightly', tagline: 'CRM with project tracking' },
  { id: 'activecampaign', name: 'ActiveCampaign', tagline: 'CRM with email automation' },
  { id: 'keap', name: 'Keap', tagline: 'CRM for small business' },
  { id: 'capsule', name: 'Capsule', tagline: 'Simple contact management' },
  { id: 'nutshell', name: 'Nutshell', tagline: 'CRM for small sales teams' },
  { id: 'sugarcrm', name: 'SugarCRM', tagline: 'A customisable CRM' },
];
