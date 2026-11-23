-- How {{ me }} feels about everyone: who to ally with, who to betray. Highest grudge first.
SELECT b AS about, round(trust, 2) AS trust, grudge, last_betrayal,
       'relationships:' || a || '/' || b AS cite
FROM marts.relationships
WHERE a = '{{ me }}'
ORDER BY grudge DESC, trust ASC
