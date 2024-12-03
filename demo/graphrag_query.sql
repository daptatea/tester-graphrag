-- Vector query
WITH 
embedding_query AS (
    SELECT azure_openai.create_embeddings('text-embedding-3-small', query)::vector AS embedding
)
vector AS (
    SELECT cases.id, cases.data#>>'{opinion, text}' AS case_text
    FROM cases, embedding_query
    WHERE (cases.data#>>'{court, id}')::integer IN (9029) -- Washington Supreme Court (9029)
    ORDER BY description_vector <=> embedding
    LIMIT 50
)
SELECT * FROM vector;

-- Semantic ranker query
WITH 
semantic AS (
    SELECT azure_ml.invoke(
				json_payload,
				deployment_name=>'bge-reranker-v2-m3')
    FROM generate_json_pairs(vector) AS json_payload
)
SELECT * FROM semantic;

-- Semantic ranker query
WITH
json_pairs AS (
    SELECT generate_json_pairs(query, case_text) AS json_pairs_data
    FROM (SELECT id, case_text FROM vector)
)
SELECT relevance, id
FROM semantic_ranker((SELECT json_pairs_data FROM json_pairs))
ORDER BY relevance DESC;

-- Semantic ranker query for CNN dataset
WITH
json_pairs AS (
    SELECT generate_json_pairs(query => 'Breaking news in GenAI', 
                               item_text  => article) AS json_pairs_data
    FROM (SELECT article FROM vector_search_results)
)
SELECT relevance, article
FROM semantic_ranker((SELECT json_pairs_data FROM json_pairs))
ORDER BY relevance DESC;

-- Graph query
WITH 
embedding_query AS (
    SELECT azure_openai.create_embeddings('text-embedding-3-small', query)::vector AS embedding
),
vector AS (
    SELECT cases.id
    FROM cases, embedding_query
    WHERE (cases.data#>>'{court, id}')::integer IN (9029, 8985) -- Washington Supreme Court (9029) or Washington Court of Appeals (8985)
    ORDER BY description_vector <=> embedding
    LIMIT 50
),
semantic AS (
    SELECT *, azure_ml.invoke(
				 json_payload,
				 deployment_name=>'bge-reranker-v2-m3')) AS relevance,
           RANK() OVER (ORDER BY relevance DESC) AS semantic_rank
    FROM generate_json_pairs(vector) AS json_payload
),
graph AS (
    SELECT *, SELECT RANK() OVER (ORDER BY graph.refs DESC) AS graph_rank
    FROM semantic
	JOIN cypher('case_graph', $$
            MATCH ()-[r]->(n)
            RETURN n.case_id, COUNT(r) AS refs
        $$) as graph_query(case_id TEXT, refs BIGINT)
	ON semantic.id = graph_query.case_id
),
rrf AS (
    SELECT *,
        COALESCE(1.0 / (60 + graph_rank), 0.0) +
        COALESCE(1.0 / (60 + semantic_rank), 0.0) AS score
    FROM graph
    LIMIT 20
)
SELECT * FROM rrf;


WITH
embedding_query AS (
    SELECT azure_openai.create_embeddings('text-embedding-3-small', query)::vector AS embedding
),
vector AS (
    SELECT cases.id, RANK() OVER (ORDER BY description_vector <=> embedding) AS vector_rank
    FROM cases, embedding_query
    WHERE (cases.data#>>'{court, id}')::integer IN (9029, 8985) -- Washington Supreme Court (9029) or Washington Court of Appeals (8985)
    ORDER BY description_vector <=> embedding
    LIMIT 50
),
semantic AS (
    SELECT * 
    FROM semantic_relevance(query, 50)
),
semantic_ranked AS (
    SELECT semantic.relevance::DOUBLE PRECISION AS relevance, 
    FROM vector
    JOIN semantic ON vector.vector_rank = semantic.ordinality
    ORDER BY semantic.relevance DESC
),
graph AS (
    SELECT * from semantic_ranked
	JOIN cypher('case_graph', $$
            MATCH ()-[r]->(n)
            RETURN n.case_id, COUNT(r) AS refs
        $$) as graph_query(case_id TEXT, refs BIGINT)
	ON semantic_ranked.id = graph_query.case_id
),
graph_ranked AS (
    SELECT RANK() OVER (ORDER BY graph.refs DESC) AS graph_rank
    FROM graph ORDER BY graph_rank DESC
),
rrf AS (
    SELECT
        COALESCE(1.0 / (60 + graph_ranked.graph_rank), 0.0) +
        COALESCE(1.0 / (60 + semantic_ranked.semantic_rank), 0.0) AS score,
        semantic_ranked.*
    FROM graph_ranked
    JOIN semantic_ranked ON graph_ranked.id = semantic_ranked.id
    ORDER BY score DESC
    LIMIT 20
)
SELECT * 
FROM rrf;

-- Views
CREATE OR REPLACE VIEW vector_similarity AS
WITH
user_query AS (
    SELECT 'Water leaking into the apartment from the floor above.' AS query_text
),
embedding_query AS (
    SELECT
        query_text,
        azure_openai.create_embeddings('text-embedding-3-small', query_text)::vector AS embedding
    FROM user_query
)
SELECT
    cases.id,
    cases.data#>>'{name_abbreviation}' AS case_name,
    cases.data#>>'{decision_date}' AS date,
	cases.data#>>'{casebody, opinions, 0, text}' AS case_text,
    cases.data AS data,
    RANK() OVER (ORDER BY description_vector <=> embedding) AS vector_rank,
    query_text,
    embedding
FROM
    cases,
    embedding_query
WHERE
    (cases.data#>>'{court, id}')::integer IN (9029) -- Washington Supreme Court (9029)
ORDER BY
    description_vector <=> embedding
LIMIT 60;

DROP VIEW vector_similarity;
DROP VIEW semantic_ranked;


CREATE VIEW semantic_ranked AS
WITH
json_payload AS (
    SELECT jsonb_build_object(
        'pairs', 
        jsonb_agg(
            jsonb_build_array(
                query_text, 
                LEFT(case_text, 800)
            )
        )
    ) AS json_pairs
    FROM vector_similarity
),
semantic AS (
    SELECT elem.relevance::DOUBLE precision as relevance, elem.ordinality
    FROM json_payload,
         LATERAL jsonb_array_elements(
             azure_ml.invoke(
                 json_pairs,
                 deployment_name => 'bge-v2-m3-1',
                 timeout_ms => 180000
             )
         ) WITH ORDINALITY AS elem(relevance)
),
semantic_ranked AS (
    SELECT RANK() OVER (ORDER BY relevance DESC) AS semantic_rank,
			semantic.*, vector_similarity.*
    FROM vector_similarity
    JOIN semantic ON vector_similarity.vector_rank = semantic.ordinality
    ORDER BY semantic.relevance DESC
)
select * from semantic_ranked;

-- UDF
CREATE OR REPLACE FUNCTION semantic_reranking(query TEXT, vector_search_results TEXT[])
RETURNS TABLE (item_text TEXT, relevance jsonb) AS $$
BEGIN
    RETURN QUERY
        WITH
        json_pairs AS(
        SELECT jsonb_build_object(
                    'pairs', 
                    jsonb_agg(
                        jsonb_build_array(query, LEFT(item_text_, 800))
                    )
                ) AS json_pairs_data
                FROM (
                    SELECT a.item_text as item_text_
                    FROM unnest(vector_search_results) as a(item_text)
                )
        ), 
        relevance_scores AS(
            SELECT jsonb_array_elements(invoke.invoke) as relevance_results
            FROM azure_ml.invoke(
                        (SELECT json_pairs_data FROM json_pairs),
                        deployment_name=>'bge-v2-m3-1', timeout_ms => 120000)
        ),
        relevance_scores_rn AS (
            SELECT *, ROW_NUMBER() OVER () AS idx
            FROM relevance_scores
        )
        SELECT a.item_text,
               r.relevance_results
            FROM
                unnest(vector_search_results) WITH ORDINALITY AS a(item_text, idx2)
            JOIN
                relevance_scores_rn AS r(relevance_results, idx)
            ON
                a.idx2 = r.idx;

END $$ 
LANGUAGE plpgsql;

-- Old Expanded semantic ranker query
WITH
json_payload AS (
    SELECT jsonb_build_object(
        'pairs', 
        jsonb_agg(
            jsonb_build_array(
                query_text, 
                LEFT(data -> 'casebody' -> 'opinions' -> 0 ->> 'text', 800)
            )
        )
    ) AS json_pairs
    FROM vector_similarity
),
semantic AS (
    SELECT elem.relevance::DOUBLE precision as relevance, elem.ordinality
    FROM json_payload,
         LATERAL jsonb_array_elements(
             azure_ml.invoke(
                 json_pairs,
                 deployment_name => 'bge-v2-m3-1',
                 timeout_ms => 180000
             )
         ) WITH ORDINALITY AS elem(relevance)
),
semantic_ranked AS (
    SELECT RANK() OVER (ORDER BY relevance DESC) AS semantic_rank,
			semantic.*, vector_similarity.*
    FROM vector_similarity
    JOIN semantic ON vector_similarity.vector_rank = semantic.ordinality
    ORDER BY semantic.relevance DESC
)
SELECT semantic_rank,relevance,id,case_name,date FROM semantic_ranked;
