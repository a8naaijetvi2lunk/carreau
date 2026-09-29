# Politique de sécurité

Carreau sert à faire passer des examens. Une faille peut fausser des notes ou exposer des données d’étudiants : chaque signalement est pris au sérieux.

## Signaler une vulnérabilité

- Utilisez le signalement privé de GitHub : onglet **Security**, puis **Report a vulnerability**.
- N’ouvrez pas d’issue publique pour une faille, et ne l’exploitez pas au-delà de ce qui est nécessaire pour la démontrer.
- Indiquez le commit ou la version concernée, les étapes pour reproduire et l’impact constaté.

## Périmètre

Sont notamment concernés :

- falsification de réponses, du chrono, du score ou des événements enregistrés ;
- accès à une bonne réponse ou à une question avant son affichage prévu ;
- usurpation de l’identité d’un étudiant, participation à une session sans y être invité ;
- accès aux données d’une autre classe ou d’un autre enseignant, élévation de privilèges ;
- prise de contrôle d’un compte : contournement de la double authentification, détournement d’une invitation, d’une réinitialisation de mot de passe ou d’une session ;
- injection (SQL, XSS), téléversement de fichiers malveillants, fuite de secrets ;
- abus du serveur MCP ou d’un jeton d’enseignant.

Ne sont pas des vulnérabilités les limites connues de la détection dans un navigateur (second appareil, capture d’écran sur iPhone), documentées dans le [README](README.md#anti-triche--ce-que-carreau-détecte-et-ce-quil-ne-peut-pas-détecter).

## Versions prises en charge

Seule la branche `main` reçoit des correctifs de sécurité.
