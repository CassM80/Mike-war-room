# War Room — Sprint 22.6

Fixes personal-board reset at the source. Clear Personal Board now removes every personalization/DNA storage key, installs a persistent cleared-state marker, clears live memory, and rerenders Scouting and War Room immediately. Full Clean Reset also unregisters service workers and clears browser caches before restarting.
