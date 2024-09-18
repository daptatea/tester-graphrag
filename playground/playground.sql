-- create table cases_playground as
select * from cases 
where COALESCE((data ->> 'decision_date')::date, '2000-01-01'::date) > '2019-01-01'
limit 100;

select * from cases_playground;
-- 
select array_to_string(ARRAY(SELECT jsonb_path_query(data, '$.casebody.opinions[*].text')), ', ') 
from cases_playground;

ALTER TABLE cases_playground
ADD COLUMN opinions_text text;
UPDATE cases_playground
SET opinions_text = array_to_string(ARRAY(SELECT jsonb_path_query(data, '$.casebody.opinions[*].text')), ', ');

ALTER TABLE cases_playground
ADD COLUMN description_vector vector(1536) --OPEN AI embeddings are 1536 dimensions
GENERATED ALWAYS AS (
	azure_openai.create_embeddings (
	  'text-embedding-3-small', -- example deployment name in Azure OpenAI which CONTAINS text-embedding-3-small-model
	  (data ->> 'name')::text || ' ' || 
	  LEFT(opinions_text, 8000) || ' ' || 
	  (data ->> 'name_abbreviation')::text,
	  1536, --dimension
	  3600000, --timeouts_ms
	  true, --throw_on_error
	  10, --max_attempts
	  10000 --retry_delay
	 )::vector) STORED; -- TEXT strings concatenated AND sent TO Azure OpenAI

ALTER TABLE cases_playground
ADD COLUMN description_vector vector(1536) --OPEN AI embeddings are 1536 dimensions
GENERATED ALWAYS AS (
	azure_openai.create_embeddings (
	  'text-embedding-3-small', -- example deployment name in Azure OpenAI which CONTAINS text-embedding-3-small-model
	  (data ->> 'name')::text)::vector) STORED;

-- What are the most prominent precedents about leaking pipes in apartment buildings
SELECT id, data
FROM cases_playground
ORDER BY description_vector <=> azure_openai.create_embeddings('text-embedding-3-small', 'What are the most prominent precedents about leaking pipes in apartment buildings')::vector
LIMIT 5;

SELECT id, data
FROM cases
WHERE jsonb_path_exists(data, '$.citations[*].cite ? (@ == "187 Wash. 2d 346")')
LIMIT 5;

-- Find all cases that are being referenced from other cases in the dataset
SELECT a.id AS id, a.data -> 'citations' -> 0 -> 'cite' AS citation, cite_to, b.id AS reference_id
FROM cases a,
LATERAL jsonb_path_query(a.data, '$.cites_to[*].cite') AS cite_to
JOIN cases b ON b.data -> 'citations' -> 0 -> 'cite' = cite_to;

-- , '$.citations[0].cite'

-- 187 Wash. 2d 346 -> 192 Wn. App. 316



