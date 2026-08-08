/**
 * Translations for this extension.
 *
 * Moved out of main.js in the 27.07.2026 refactoring round: 186 of its
 * 662 lines were dictionary literals, which made the file look far more
 * complicated than it is. Pure data - esbuild inlines it exactly as before.
 */

const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	document.documentElement.lang ||
	'en'
).toLowerCase();

const DE = {
	'One design, re-laid-out for every platform.':
		'Ein Design, neu arrangiert für jede Plattform.',
	'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.':
		'Hintergründe füllen jedes Format; Texte und Logos behalten ihre Anker und bleiben in den Safe-Zones der Plattform.',
	Formats: 'Formate',
	All: 'Alle',
	None: 'Keine',
	Options: 'Optionen',
	'Content scale': 'Skalierung',
	'Respect platform safe zones': 'Safe-Zones beachten',
	'File type': 'Dateityp',
	'File name': 'Dateiname',
	Export: 'Export',
	'Download ZIP': 'ZIP herunterladen',
	'Save to Media Library': 'In Mediathek speichern',
	'Select at least one format.': 'Mindestens ein Format wählen.',
	'Rendering formats…': 'Formate werden gerendert…',
	'Saving to the media library…': 'Speichern in die Mediathek…',
	'saved.': 'gespeichert.',
	'Could not save some formats.':
		'Einige Formate konnten nicht gespeichert werden.',
	'The document has no layers yet.':
		'Das Dokument hat noch keine Ebenen.',
	Cancel: 'Abbrechen',
	'Instagram Post': 'Instagram-Post',
	'Instagram Portrait': 'Instagram-Porträt',
	'Story / Reel': 'Story / Reel',
	'Pinterest Pin': 'Pinterest-Pin',
	'YouTube Thumbnail': 'YouTube-Thumbnail',
	'Facebook / OG Image': 'Facebook / OG-Bild',
	'X Post': 'X-Post',
	'LinkedIn Post': 'LinkedIn-Post',
	'X Header': 'X-Header',
	'Facebook Cover': 'Facebook-Cover',
};

const ES = {
	'One design, re-laid-out for every platform.':
		'Un diseño, recompuesto para cada plataforma.',
	'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.':
		'Los fondos llenan cada formato; los textos y logotipos conservan sus anclas y se mantienen dentro de las zonas seguras de cada plataforma.',
	Formats: 'Formatos',
	All: 'Todo',
	None: 'Ninguno',
	Options: 'Opciones',
	'Content scale': 'Escala del contenido',
	'Respect platform safe zones': 'Respetar las zonas seguras de la plataforma',
	'File type': 'Tipo de archivo',
	'File name': 'Nombre de archivo',
	Export: 'Exportar',
	'Download ZIP': 'Descargar ZIP',
	'Save to Media Library': 'Guardar en la biblioteca de medios',
	'Select at least one format.': 'Selecciona al menos un formato.',
	'Rendering formats…': 'Renderizando formatos…',
	'Saving to the media library…': 'Guardando en la biblioteca de medios…',
	'saved.': 'guardado.',
	'Could not save some formats.': 'Algunos formatos no se pudieron guardar.',
	'The document has no layers yet.': 'El documento aún no tiene capas.',
	Cancel: 'Cancelar',
	'Instagram Post': 'Post de Instagram',
	'Instagram Portrait': 'Instagram vertical',
	'Story / Reel': 'Story / Reel',
	'Pinterest Pin': 'Pin de Pinterest',
	'YouTube Thumbnail': 'Miniatura de YouTube',
	'Facebook / OG Image': 'Imagen de Facebook / OG',
	'X Post': 'Post de X',
	'LinkedIn Post': 'Post de LinkedIn',
	'X Header': 'Cabecera de X',
	'Facebook Cover': 'Portada de Facebook',
};

const FR = {
	'One design, re-laid-out for every platform.':
		'Un design, recomposé pour chaque plateforme.',
	'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.':
		'Les arrière-plans remplissent chaque format ; textes et logos gardent leurs ancres et restent dans les zones sûres de chaque plateforme.',
	Formats: 'Formats',
	All: 'Tout',
	None: 'Aucun',
	Options: 'Options',
	'Content scale': 'Échelle du contenu',
	'Respect platform safe zones': 'Respecter les zones sûres des plateformes',
	'File type': 'Type de fichier',
	'File name': 'Nom de fichier',
	Export: 'Exporter',
	'Download ZIP': 'Télécharger le ZIP',
	'Save to Media Library': 'Enregistrer dans la médiathèque',
	'Select at least one format.': 'Sélectionne au moins un format.',
	'Rendering formats…': 'Rendu des formats…',
	'Saving to the media library…': 'Enregistrement dans la médiathèque…',
	'saved.': 'enregistré.',
	'Could not save some formats.':
		'Certains formats n\'ont pas pu être enregistrés.',
	'The document has no layers yet.': 'Le document n\'a pas encore de calques.',
	Cancel: 'Annuler',
	'Instagram Post': 'Post Instagram',
	'Instagram Portrait': 'Instagram portrait',
	'Story / Reel': 'Story / Reel',
	'Pinterest Pin': 'Épingle Pinterest',
	'YouTube Thumbnail': 'Miniature YouTube',
	'Facebook / OG Image': 'Image Facebook / OG',
	'X Post': 'Post X',
	'LinkedIn Post': 'Post LinkedIn',
	'X Header': 'En-tête X',
	'Facebook Cover': 'Couverture Facebook',
};

const PT = {
	'One design, re-laid-out for every platform.':
		'Um design, recomposto para cada plataforma.',
	'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.':
		'Os fundos preenchem cada formato; textos e logotipos mantêm suas âncoras e ficam dentro das zonas seguras de cada plataforma.',
	Formats: 'Formatos',
	All: 'Tudo',
	None: 'Nenhum',
	Options: 'Opções',
	'Content scale': 'Escala do conteúdo',
	'Respect platform safe zones': 'Respeitar as zonas seguras das plataformas',
	'File type': 'Tipo de arquivo',
	'File name': 'Nome do arquivo',
	Export: 'Exportar',
	'Download ZIP': 'Baixar ZIP',
	'Save to Media Library': 'Salvar na biblioteca de mídia',
	'Select at least one format.': 'Selecione pelo menos um formato.',
	'Rendering formats…': 'Renderizando formatos…',
	'Saving to the media library…': 'Salvando na biblioteca de mídia…',
	'saved.': 'salvo.',
	'Could not save some formats.': 'Alguns formatos não puderam ser salvos.',
	'The document has no layers yet.': 'O documento ainda não tem camadas.',
	Cancel: 'Cancelar',
	'Instagram Post': 'Post do Instagram',
	'Instagram Portrait': 'Instagram retrato',
	'Story / Reel': 'Story / Reel',
	'Pinterest Pin': 'Pin do Pinterest',
	'YouTube Thumbnail': 'Miniatura do YouTube',
	'Facebook / OG Image': 'Imagem do Facebook / OG',
	'X Post': 'Post do X',
	'LinkedIn Post': 'Post do LinkedIn',
	'X Header': 'Cabeçalho do X',
	'Facebook Cover': 'Capa do Facebook',
};

const IT = {
	'One design, re-laid-out for every platform.':
		'Un design, ricomposto per ogni piattaforma.',
	'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.':
		'Gli sfondi riempiono ogni formato; testi e loghi mantengono le loro ancore e restano nelle zone sicure di ogni piattaforma.',
	Formats: 'Formati',
	All: 'Tutto',
	None: 'Nessuno',
	Options: 'Opzioni',
	'Content scale': 'Scala del contenuto',
	'Respect platform safe zones': 'Rispetta le zone sicure delle piattaforme',
	'File type': 'Tipo di file',
	'File name': 'Nome del file',
	Export: 'Esporta',
	'Download ZIP': 'Scarica ZIP',
	'Save to Media Library': 'Salva nella libreria media',
	'Select at least one format.': 'Seleziona almeno un formato.',
	'Rendering formats…': 'Rendering dei formati…',
	'Saving to the media library…': 'Salvataggio nella libreria media…',
	'saved.': 'salvato.',
	'Could not save some formats.': 'Alcuni formati non sono stati salvati.',
	'The document has no layers yet.': 'Il documento non ha ancora livelli.',
	Cancel: 'Annulla',
	'Instagram Post': 'Post Instagram',
	'Instagram Portrait': 'Instagram verticale',
	'Story / Reel': 'Storia / Reel',
	'Pinterest Pin': 'Pin di Pinterest',
	'YouTube Thumbnail': 'Miniatura YouTube',
	'Facebook / OG Image': 'Immagine Facebook / OG',
	'X Post': 'Post X',
	'LinkedIn Post': 'Post LinkedIn',
	'X Header': 'Intestazione X',
	'Facebook Cover': 'Copertina Facebook',
};
const NL = {
	'One design, re-laid-out for every platform.':
		'Eén ontwerp, opnieuw opgemaakt voor elk platform.',
	'Backgrounds fill each frame; text and logos keep their anchors and stay inside each platform’s safe zones.':
		'Achtergronden vullen elk formaat; tekst en logo’s behouden hun ankers en blijven binnen de veilige zones van elk platform.',
	Formats: 'Formaten',
	All: 'Alles',
	None: 'Geen',
	Options: 'Opties',
	'Content scale': 'Inhoudsschaal',
	'Respect platform safe zones': 'Veilige zones van platforms respecteren',
	'File type': 'Bestandstype',
	'File name': 'Bestandsnaam',
	Export: 'Exporteren',
	'Download ZIP': 'ZIP downloaden',
	'Save to Media Library': 'Opslaan in mediabibliotheek',
	'Select at least one format.': 'Selecteer minstens één formaat.',
	'Rendering formats…': 'Formaten renderen…',
	'Saving to the media library…': 'Opslaan in de mediabibliotheek…',
	'saved.': 'opgeslagen.',
	'Could not save some formats.':
		'Sommige formaten konden niet worden opgeslagen.',
	'The document has no layers yet.': 'Het document heeft nog geen lagen.',
	Cancel: 'Annuleren',
	'Instagram Post': 'Instagram-post',
	'Instagram Portrait': 'Instagram-portret',
	'Story / Reel': 'Story / Reel',
	'Pinterest Pin': 'Pinterest-pin',
	'YouTube Thumbnail': 'YouTube-miniatuur',
	'Facebook / OG Image': 'Facebook / OG-afbeelding',
	'X Post': 'X-post',
	'LinkedIn Post': 'LinkedIn-post',
	'X Header': 'X-header',
	'Facebook Cover': 'Facebook-omslag',
};

const DICTS = { de: DE, es: ES, fr: FR, pt: PT, it: IT, nl: NL };
const DICT = DICTS[ LOCALE.slice( 0, 2 ) ] || null;
export const t = ( s ) => ( DICT && DICT[ s ] ) || s;
