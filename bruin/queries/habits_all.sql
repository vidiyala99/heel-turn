-- Every habit row for {{ player }} across situations, one call (the game reads this before the bell).
SELECT situation, move, n, round(share, 2) AS share,
       'habits:' || player || '/' || situation || '/' || move AS cite
FROM marts.habits
WHERE player = '{{ player }}'
ORDER BY situation, share DESC
