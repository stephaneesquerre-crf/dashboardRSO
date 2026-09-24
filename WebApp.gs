// Affichage minimal (voir CLAUDE.md : éprouver lecture -> calcul -> affichage
// sur l'indicateur unique avant d'élargir). Pas de couche droits complète ici
// : simple restriction de domaine, cohérente avec IdentityService.gs déjà en
// place. La demande d'accès / gestion des rôles reste à construire à part.
function doGet() {
  const email = getActiveUserEmail_();
  if (!isAllowedIdentityEmail_(email)) {
    return HtmlService.createHtmlOutput(
      '<p style="font: 14px sans-serif; padding: 24px;">' +
      'Accès réservé aux comptes @croix-rouge.fr.</p>'
    );
  }

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Dashboard RSO')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
