# Not Yet Forgotten (NYF)

Pour que la mémoire reste. Une galerie pour découvrir les œuvres d’art disparues,
leur histoire et les traces qu’elles nous ont laissées.

## Démarrer en local

Depuis la racine du dépôt, lancer :

```sh
python3 scripts/serve.py
```

Ouvrir <http://localhost:8000>. Un serveur HTTP est nécessaire au chargement du
catalogue JSON ; ouvrir directement `index.html` avec `file://` ne suffit pas.
Aucune installation de dépendances n’est nécessaire.
Ce serveur désactive le cache pour que les changements de textes, de styles et de
scripts soient visibles après un rechargement. Il sert toujours la racine du projet.
Pour changer de port : `python3 scripts/serve.py --port 8001`.
Lors du premier passage depuis `python3 -m http.server`, arrêter l’ancien serveur
avec Ctrl+C, lancer cette commande et faire un rechargement forcé (Ctrl+Maj+R).

## Organisation

- `index.html` : structure des écrans, sans les notices des œuvres.
- `config/oeuvres.json` : catalogue, œuvre d’accueil, récits, images et sources.
- `config/translations/fr.json` : textes de l’interface en français.
- `config/translations/en.json` : interface, notices et événements en anglais.
- `assets/styles.css` : palette papier et olive, typographie et mise en page mobile.
- `assets/oeuvres/<id-œuvre>/` : reproductions locales regroupées par œuvre :
  `miniature.jpg` pour la galerie, `large.jpg` ou `large.webp` pour la visionneuse et `apercu.webp`
  pour la prévisualisation dans la conversation.
- `js/app.js` : affichage, tirage aléatoire et historique de visite.
- `js/bootstrap.js` : chargement du catalogue et des traductions.
- `scripts/serve.py` : serveur de développement sans cache.

Les textes portant un attribut `data-i18n` dans `index.html` sont remplacés au
chargement par le dictionnaire de la langue sélectionnée. Pour renommer le bouton
de découverte, modifier `ui.randomArtwork` dans `config/translations/fr.json`
(et son équivalent anglais dans `en.json`). Modifier uniquement le texte HTML ne
change pas le libellé affiché une fois les traductions chargées.

Pour ajouter une œuvre, ajouter une entrée dans `artworks` avec un `id` unique,
son `artistId`, ses métadonnées, son récit (`story`), ses sources et son image locale. Renseigner
les dimensions physiques dans `dimensions` (en centimètres, hauteur avant largeur
lorsque deux mesures sont indiquées), séparément des dimensions en pixels de l’image.
Conserver `inventoryNumber` dans les données lorsque la référence d’inventaire
est connue, ainsi que le crédit et la source de l’image. Ce numéro n’est plus
affiché comme champ de la fiche. `image.originalSourceUrl` conserve l’adresse de
la reproduction téléchargée lorsqu’elle est disponible.
Le nom de l’œuvre est le titre principal de la fiche ; `headline` fournit le
sous-titre poétique, affiché plus petit. Les reproductions conservent leurs
proportions, sans recadrage, et occupent davantage de largeur sur les grands écrans.

La liste `artists` du catalogue définit les artistes par un `id` stable et un
`name` commun à leurs notices. Chaque œuvre référence ce regroupement par
`artistId` ; les regroupements ne sont pas déduits du texte traduit du nom.
La ligne « Artiste », au-dessus des dimensions, ouvre une page qui réunit ses
œuvres disparues présentes dans la galerie. Le retour retrouve la fiche de départ ;
ouvrir une autre œuvre poursuit l’historique de visite. Images agrandies,
traductions et transitions fonctionnent aussi sur ces pages.
Pour les créateurs inconnus, `kind: "origin"` présente une origine culturelle ;
`kind: "after"` conserve une attribution « d’après » sans la confondre avec une
exécution directe. Les noms traduits sont dans `artists` de `en.json`.

La ligne « Estimation » affiche une fourchette de prix. Le champ
optionnel `valuation` contient `minimum`, `maximum`, `currency` (code ISO de la
devise), ainsi qu’une `source` avec `label`, `url` et `date`. Une estimation
historique reste accompagnée de sa date de publication et n’est pas présentée
comme une expertise actuelle. Une fourchette définie par le propriétaire du projet
peut utiliser `type: "editorial-range"` sans source externe ; l’interface la présente
comme une « Fourchette indicative ». Sans fourchette renseignée, `valuation` vaut `null`
et la fiche indique « Estimation non documentée ». Les valeurs d’un ensemble
volé, les récompenses et les prix de reproductions ne sont pas des estimations
individuelles. Les fourchettes éditoriales sont de 170–250 millions de dollars
américains pour Le Concert et de 120–150 millions pour La Tempête sur la mer de
Galilée. Les douze autres notices restent non documentées.
L’accueil choisit une œuvre au hasard à chaque arrivée, y compris après un
rechargement, en évitant celle de l’accueil précédent si le catalogue en contient
plusieurs. Un changement de langue conserve l’œuvre affichée. Le bouton pour
commencer la visite ouvre l’œuvre présentée sur cet accueil.

Chaque œuvre référence un `disappearanceEventId` dans la liste `events` du même
catalogue. Un événement définit la date (année `1945` ou date `1990-03-18`),
la cause à laquelle la disparition est attribuée, son contexte et ses sources.
Les œuvres du même événement sont regroupées automatiquement, sans déduire un
lien à partir de leur seule date.
Les informations incertaines restent signalées comme telles.
Le catalogue réunit les treize pièces du vol Gardner de 1990 (cinq peintures,
cinq œuvres de Degas sur papier, une eau-forte de Rembrandt et deux bronzes),
ainsi que le Van Gogh disparu en 1945. Les deux études de Degas pour le programme
de 1884 sont deux œuvres distinctes, inventoriées `3.1.o.96` et `3.1.o.97`.

Le clic sur une image ouvre une visionneuse, sur l’accueil, la fiche d’œuvre et la
page d’événement. `image.largeSrc` fournit la reproduction en meilleure résolution ;
la petite image sert de repli si elle n’est pas disponible. La visionneuse occupe
toute la fenêtre et agrandit la reproduction au maximum sans la recadrer.
L’auteur et la date de disparition sont indiqués dans son en-tête, séparément
de la date de création. On la ferme avec la croix sur fond olive ou la touche Échap.
L’image apparaît avec un fondu du flou vers le net. Les transitions entre pages,
les glissements des fiches et l’ouverture/fermeture de la visionneuse partagent
une durée d’environ 1,1 seconde et une même courbe de progression. La préférence
système de réduction des animations désactive ces mouvements.
Dans la visionneuse, les boutons − et + règlent le zoom entre 100 % et 200 %.
Le pourcentage rétablit la vue entière. La molette et le double-clic permettent
également de zoomer ; glisser l’image agrandie la déplace, à la souris ou au doigt.
Le zoom se réinitialise à chaque ouverture. Le logo en en-tête ramène à l’accueil ;
les liens « Revenir à l’entrée » ont été retirés.

Le bouton EN/FR change l’ensemble des contenus sans modifier le parcours de visite.
La préférence de langue est conservée dans le navigateur. Pour traduire une nouvelle
œuvre ou un nouvel événement, ajouter son identifiant à `artworks` ou `events` dans
`config/translations/en.json`. Les notices françaises du catalogue servent de repli.

La visite privilégie les œuvres encore inédites dans le parcours courant. Une
fois toutes découvertes, le tirage reste aléatoire et exclut toujours l’œuvre
affichée. Le retour suit les œuvres réellement visitées. Après un retour, un
nouveau tirage ouvre une nouvelle branche du parcours. L’historique conserve
jusqu’à 100 étapes dans la session du navigateur.
Les flèches de navigation se placent de chaque côté de la fiche sur ordinateur
et dans une barre en haut sur mobile. La fiche actuelle glisse vers la gauche
pour découvrir une autre œuvre et vers la droite pour revenir à la précédente.
Les deux fiches restent visibles pendant la transition. La préférence système
de réduction des animations désactive ce mouvement.

## Prévisualisation dans la conversation

```sh
python3 scripts/build_preview.py
```

Cette commande génère `design/preview.html`, ignoré par Git, à partir des mêmes
sources. Ce fichier dérivé réunit les ressources uniquement pour l’affichage
dans la conversation. Les modifications se font dans les fichiers sources.
Le champ optionnel `image.previewLargeSrc` fournit une reproduction plus légère,
intégrée une seule fois et partagée par la galerie et la visionneuse de cet aperçu,
pour rester sous sa limite de taille. Le site utilise toujours les fichiers
`image.src` et `image.largeSrc` à leur résolution prévue.
