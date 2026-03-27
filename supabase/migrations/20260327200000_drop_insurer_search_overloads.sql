-- Drop duplicate insurer_search_certificates overloads
-- Keep only the 5-parameter version (from insurer_portal_v2)
DROP FUNCTION IF EXISTS insurer_search_certificates(text, integer, integer, text, text, text);
DROP FUNCTION IF EXISTS insurer_search_certificates(text, integer, integer, text, text, text, timestamp, timestamp);
