-- Semantic ranking query
WITH
semantic AS (
  SELECT RANK() OVER (ORDER BY relevance DESC) AS semantic_rank,
      	 relevance, item_text AS case_text
  FROM semantic_reranking('Water leaking into the apartment from the floor above.', 
         ARRAY(SELECT case_text FROM vector_similarity)) 
  ORDER BY relevance DESC
)
SELECT * FROM semantic;
