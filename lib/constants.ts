export const SUB_CITIES = ['Bole', 'Kirkos', 'Yeka', 'Lideta', 'Arada', 'Akaki Kality', 'Nefas Silk Lafto', 'Kolfe Keranio', 'Gullele', 'Addis Ketema', 'Lemi Kura'] as const

export const INCIDENT_CATEGORIES = ['Illegal Construction', 'Land Grabbing / Illegal Occupancy', 'Public Sidewalk Obstruction', 'Illegal Waste Dumping / Sanitation', 'Illegal Street Vending', 'Unauthorized Billboard', 'Other'] as const
export const INCIDENT_STATUSES = ['New', 'In progress', 'Escalated', 'Resolved'] as const
export const PRIORITIES = ['Low', 'Medium', 'High'] as const

export const SERVICE_CATEGORIES = ['Building permit review', 'Waste collection', 'Street vendor registration', 'Public space booking', 'Inspection request', 'General inquiry', 'Other'] as const
export const SERVICE_STATUSES = ['Received', 'Assigned', 'In review', 'Closed'] as const

export const STAFF_ROLES = ['Administrator', 'Supervisor', 'Senior inspector', 'Field inspector', 'Case coordinator'] as const
export const STAFF_STATUSES = ['Active', 'On leave', 'Inactive'] as const

export const NOTIFICATION_TYPES = ['urgent', 'assignment', 'info'] as const

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]
export type ServiceStatus = (typeof SERVICE_STATUSES)[number]
