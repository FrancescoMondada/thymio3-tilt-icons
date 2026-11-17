# Thymio · Icônes d'inclinaison

Page qui affiche **en temps réel** les trois icônes d'inclinaison de VPL3 à partir de l'accéléromètre d'un Thymio 3, pour **valider** leurs formules
avant qu'elles passent dans le firmware:

| Icône | Vue | Angle | Formule (axes du robot: avant `xf`, gauche `yl`, haut `zu`) |
| --- | --- | --- | --- |
| Roll | de face | −180…+180, côté gauche bas = + | `atan2(-yl, zu)` (n'a pas de sens sur la queue ou le nez) |
| Pitch | de côté | −180…+180 (tour complet), avant levé = − | `atan2(-xf, sgn(zu)·sqrt(yl² + zu²))` (n'a pas de sens couché sur un côté) |
| Orientation debout | de dessus | −180…+180, sens horaire, 0 = debout sur la queue | `atan2(yl, xf)` (n'a pas de sens à plat) |

Le pitch « découplé » (la racine met le roll hors du calcul, le signe de `zu` permet le tour complet; à l'envers à plat, pitch et roll lisent tous deux 180°) supprime l'interaction entre les deux angles de la formule du Thymio 2 (`atan2(x, z)`): voir les notes dans
`tilt_test*.py` (dossier `thymio3-imu-tilt`).

## Repère réel du capteur (mesuré le 2026-11-17)

`imu.get_acc()` donne **x vers l'arrière, y vers la droite, z vers le haut** (z = +16384 à plat). La page le retourne (`xf = −x`, `yl = −y`): réglage « repère retourné ».

## Utilisation

- **Simulation** (par défaut): curseurs pitch / roll / bruit et huit poses; pas besoin de robot.
- **Connecter un robot**: Web Bluetooth (Chrome sur ordinateur ou Android, Bluefy sur iPad/iPhone). La page installe une fois `src/py/tilt_stream.py`
  sur le robot (module `tilt_<hash>.py`), puis le lance; le robot envoie `@@a ms x y z` dix fois par seconde. Pendant ce temps les comportements du robot sont coupés.
- Toucher un **point** d'un cadran choisit le pas attendu de l'icône (anneau orange); elle est « déclenchée » quand le pas actif (±7,5°) est celui-là.
- **Réglages**: seuils de validité (`r`, `q`), marge avant de changer de pas (hystérésis), lissage, sens des angles, calibration à plat (décalages de x et y seulement; z n'est jamais corrigé).
- `?fakerobot` dans l'adresse remplace Bluetooth par un faux robot (même interface) pour essayer toute la liaison sans matériel.

## Le code Python de la page

La section **Code Python (Thymio 3)** montre le code qui calcule les trois angles et dit quand chaque icône est inactive (`tilt()` et `next_step()`), avec les réglages courants
(il change quand on change un réglage), un bouton pour le copier et un programme d'essai à coller dans la démo ts-api. `tests/tilt.test.js` l'exécute avec `python3`
et le compare à la page sur 300 poses au hasard et trois jeux de réglages (angles, activité, pas).

## Développement

```bash
npm install      # (l'API Thymio vient de GitHub: Mobsya/thymio3-ts-api)
npm run dev      # http://localhost:5190 (voir .claude/launch.json)
npm test         # formules contre le tableau mesuré sur le robot + protocole + script du robot (faux module thymio)
npm run build
```

## Ce qui est vérifié, et ce qui ne l'est pas

- Vérifié: les formules reproduisent à 1° près le tableau de la mesure guidée sur un vrai robot (`tests/tilt.test.js`); le script du robot (format, 100 octets,
  comportements rendus); la liaison complète avec le faux robot; l'affichage en clair, en sombre et à 375 px.
- **Pas essayé sur un vrai robot avec cette page.** Seuils (`r` ≥ 0,3, `q` ≥ 0,3), marge de 0, pas de 15° du cadran debout, sens horaire de l'angle debout: choix à confirmer
  avec les développeurs de VPL3 et par l'usage.
