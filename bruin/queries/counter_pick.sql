-- The move that beats {{ player }}'s most likely move in {{ situation }} (strike<block, grapple<strike, block<grapple).
SELECT move AS expect, share,
       CASE move WHEN 'strike' THEN 'block' WHEN 'grapple' THEN 'strike' WHEN 'block' THEN 'grapple' END AS counter,
       'habits:' || player || '/' || situation || '/' || move AS cite
FROM marts.habits
WHERE player = '{{ player }}' AND situation = '{{ situation }}'
ORDER BY share DESC, n DESC
LIMIT 1
