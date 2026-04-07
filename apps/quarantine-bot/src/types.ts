// ============================================================================
// Quarantine Bot — Shared Types
// ============================================================================

/** A normalized quarantine row ready for CSV output */
export interface QuarantineZoneRow {
  country_iso_3: string;
  state_code: string;
  state_name: string;
  county_name: string;
  city_name: string;
  sales_categories: string[];
  produce_categories: string[];
  keywords: string[];
  pest_name: string;
  notes: string;
  starts_at: string; // YYYY-MM-DD
  ends_at: string; // YYYY-MM-DD or empty
  source_url: string;
  is_active: string; // "true" / "false"
  data_source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  scraped_at: string; // ISO 8601
}

/** Raw record from any source before normalization */
export interface RawQuarantineRecord {
  pest_name: string;
  notes: string;
  state_code: string;
  state_name: string;
  county_name: string;
  city_name?: string;
  starts_at?: Date | null;
  ends_at?: Date | null;
  source_url: string;
  is_active: boolean;
  data_source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/** Health status for a single data source */
export interface SourceHealth {
  source_name: string;
  status: 'OK' | 'DEGRADED' | 'FAILED';
  records_fetched: number;
  duration_ms: number;
  errors: string[];
  warnings: string[];
  schema_issues: SchemaIssue[];
}

/** A detected schema change or anomaly */
export interface SchemaIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  field: string;
  message: string;
  expected?: string;
  actual?: string;
}

/** Configuration for a state ArcGIS feed */
export interface StateFeedConfig {
  state_code: string;
  state_name: string;
  endpoint_url: string;
  /** Maps source field names → our expected fields */
  field_map: {
    notes_field: string;
    status: string;
    active_date: string;
    completed_date?: string;
    project_name?: string;
  };
  /** Expected status value for "active" */
  active_status_value: string;
}
