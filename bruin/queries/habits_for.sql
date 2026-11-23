-- What does {{ player }} do in {{ situation }}? An AI reads this before planning against a human.
SELECT move, n, round(share, 2) AS share,
       'habits:' || player || '/' || situation || '/' || move AS cite
FROM marts.habits
WHERE player = '{{ player }}' AND situation = '{{ situation }}'
ORDER BY share DESC
