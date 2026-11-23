-- Leaderboard screen.
SELECT w.display_name, l.wins, l.eliminations, l.betrayals
FROM marts.leaderboard l JOIN seeds.wrestlers w USING (wrestler)
ORDER BY l.wins DESC, l.eliminations DESC
