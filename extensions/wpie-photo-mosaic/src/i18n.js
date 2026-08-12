/**
 * Translations for this extension.
 *
 * Moved out of main.js in the 27.07.2026 refactoring round: 175 of its
 * 867 lines were dictionary literals, which made the file look far more
 * complicated than it is. Pure data - esbuild inlines it exactly as before.
 */

const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	document.documentElement.lang ||
	'en'
).toLowerCase();

const DE = {
	'Your image, rebuilt from many photos - as an editable layer.':
		'Dein Bild, nachgebaut aus vielen Fotos - als editierbare Ebene.',
	Close: 'Schließen',
	Cancel: 'Abbrechen',
	'Insert mosaic': 'Mosaik einfügen',
	'Update mosaic': 'Mosaik aktualisieren',
	'Main image': 'Hauptbild',
	Tiles: 'Kacheln',
	Settings: 'Einstellungen',
	'Whole document': 'Gesamtes Dokument',
	'Media library': 'Mediathek',
	'Choose image': 'Bild wählen',
	'Use image': 'Bild verwenden',
	'Pick tile photos': 'Kachel-Fotos wählen',
	'Use photos': 'Fotos verwenden',
	Clear: 'Leeren',
	'%d photos loaded': '%d Fotos geladen',
	'Add at least %d photos - the more, the better the mosaic.':
		'Mindestens %d Fotos wählen - je mehr, desto besser das Mosaik.',
	'Loading tiles…': 'Kacheln werden geladen…',
	Columns: 'Spalten',
	'Color match': 'Farbangleich',
	'0% = pure tile matching only': '0% = nur reine Kachelwahl',
	'Rendering the mosaic': 'Mosaik wird gerechnet',
	'Inserted.': 'Eingefügt.',
	'Mosaic updated.': 'Mosaik aktualisiert.',
	'Could not insert the mosaic.': 'Mosaik konnte nicht eingefügt werden.',
	'Could not load the image.': 'Bild konnte nicht geladen werden.',
	'Everything is computed locally in your browser.':
		'Alles wird lokal in deinem Browser berechnet.',
};

const ES = {
	'Your image, rebuilt from many photos - as an editable layer.':
		'Tu imagen, reconstruida con muchas fotos, como capa editable.',
	Close: 'Cerrar',
	Cancel: 'Cancelar',
	'Insert mosaic': 'Insertar mosaico',
	'Update mosaic': 'Actualizar mosaico',
	'Main image': 'Imagen principal',
	Tiles: 'Teselas',
	Settings: 'Ajustes',
	'Whole document': 'Documento completo',
	'Media library': 'Biblioteca de medios',
	'Choose image': 'Elegir imagen',
	'Use image': 'Usar imagen',
	'Pick tile photos': 'Elegir fotos de teselas',
	'Use photos': 'Usar fotos',
	Clear: 'Vaciar',
	'%d photos loaded': '%d fotos cargadas',
	'Add at least %d photos - the more, the better the mosaic.':
		'Añade al menos %d fotos: cuantas más, mejor el mosaico.',
	'Loading tiles…': 'Cargando teselas…',
	Columns: 'Columnas',
	'Color match': 'Ajuste de color',
	'0% = pure tile matching only': '0% = solo selección pura de teselas',
	'Rendering the mosaic': 'Generando el mosaico',
	'Inserted.': 'Insertado.',
	'Mosaic updated.': 'Mosaico actualizado.',
	'Could not insert the mosaic.': 'No se pudo insertar el mosaico.',
	'Could not load the image.': 'No se pudo cargar la imagen.',
	'Everything is computed locally in your browser.':
		'Todo se calcula localmente en tu navegador.',
};

const FR = {
	'Your image, rebuilt from many photos - as an editable layer.':
		'Votre image, reconstruite à partir de nombreuses photos, en calque modifiable.',
	Close: 'Fermer',
	Cancel: 'Annuler',
	'Insert mosaic': 'Insérer la mosaïque',
	'Update mosaic': 'Mettre à jour la mosaïque',
	'Main image': 'Image principale',
	Tiles: 'Tuiles',
	Settings: 'Réglages',
	'Whole document': 'Document entier',
	'Media library': 'Médiathèque',
	'Choose image': 'Choisir une image',
	'Use image': "Utiliser l'image",
	'Pick tile photos': 'Choisir les photos-tuiles',
	'Use photos': 'Utiliser les photos',
	Clear: 'Vider',
	'%d photos loaded': '%d photos chargées',
	'Add at least %d photos - the more, the better the mosaic.':
		'Ajoutez au moins %d photos - plus il y en a, meilleure est la mosaïque.',
	'Loading tiles…': 'Chargement des tuiles…',
	Columns: 'Colonnes',
	'Color match': 'Ajustement des couleurs',
	'0% = pure tile matching only': '0 % = pur choix de tuiles uniquement',
	'Rendering the mosaic': 'Génération de la mosaïque',
	'Inserted.': 'Inséré.',
	'Mosaic updated.': 'Mosaïque mise à jour.',
	'Could not insert the mosaic.': "Impossible d'insérer la mosaïque.",
	'Could not load the image.': "Impossible de charger l'image.",
	'Everything is computed locally in your browser.':
		'Tout est calculé localement dans votre navigateur.',
};

const PT = {
	'Your image, rebuilt from many photos - as an editable layer.':
		'Sua imagem, reconstruída com muitas fotos, como camada editável.',
	Close: 'Fechar',
	Cancel: 'Cancelar',
	'Insert mosaic': 'Inserir mosaico',
	'Update mosaic': 'Atualizar mosaico',
	'Main image': 'Imagem principal',
	Tiles: 'Peças',
	Settings: 'Configurações',
	'Whole document': 'Documento inteiro',
	'Media library': 'Biblioteca de mídia',
	'Choose image': 'Escolher imagem',
	'Use image': 'Usar imagem',
	'Pick tile photos': 'Escolher fotos das peças',
	'Use photos': 'Usar fotos',
	Clear: 'Limpar',
	'%d photos loaded': '%d fotos carregadas',
	'Add at least %d photos - the more, the better the mosaic.':
		'Adicione pelo menos %d fotos - quanto mais, melhor o mosaico.',
	'Loading tiles…': 'Carregando peças…',
	Columns: 'Colunas',
	'Color match': 'Ajuste de cor',
	'0% = pure tile matching only': '0% = apenas seleção pura de peças',
	'Rendering the mosaic': 'Gerando o mosaico',
	'Inserted.': 'Inserido.',
	'Mosaic updated.': 'Mosaico atualizado.',
	'Could not insert the mosaic.': 'Não foi possível inserir o mosaico.',
	'Could not load the image.': 'Não foi possível carregar a imagem.',
	'Everything is computed locally in your browser.':
		'Tudo é calculado localmente no seu navegador.',
};

const IT = {
	'Your image, rebuilt from many photos - as an editable layer.':
		'La tua immagine, ricostruita da tante foto, come livello modificabile.',
	Close: 'Chiudi',
	Cancel: 'Annulla',
	'Insert mosaic': 'Inserisci mosaico',
	'Update mosaic': 'Aggiorna mosaico',
	'Main image': 'Immagine principale',
	Tiles: 'Tessere',
	Settings: 'Impostazioni',
	'Whole document': 'Documento intero',
	'Media library': 'Libreria media',
	'Choose image': 'Scegli immagine',
	'Use image': 'Usa immagine',
	'Pick tile photos': 'Scegli le foto-tessere',
	'Use photos': 'Usa foto',
	Clear: 'Svuota',
	'%d photos loaded': '%d foto caricate',
	'Add at least %d photos - the more, the better the mosaic.':
		'Aggiungi almeno %d foto: più sono, migliore è il mosaico.',
	'Loading tiles…': 'Caricamento tessere…',
	Columns: 'Colonne',
	'Color match': 'Adattamento colore',
	'0% = pure tile matching only': '0% = solo scelta pura delle tessere',
	'Rendering the mosaic': 'Generazione del mosaico',
	'Inserted.': 'Inserito.',
	'Mosaic updated.': 'Mosaico aggiornato.',
	'Could not insert the mosaic.': 'Impossibile inserire il mosaico.',
	'Could not load the image.': "Impossibile caricare l'immagine.",
	'Everything is computed locally in your browser.':
		'Tutto viene calcolato localmente nel tuo browser.',
};

const NL = {
	'Your image, rebuilt from many photos - as an editable layer.':
		'Jouw afbeelding, opnieuw opgebouwd uit veel foto’s - als bewerkbare laag.',
	Close: 'Sluiten',
	Cancel: 'Annuleren',
	'Insert mosaic': 'Mozaïek invoegen',
	'Update mosaic': 'Mozaïek bijwerken',
	'Main image': 'Hoofdafbeelding',
	Tiles: 'Tegels',
	Settings: 'Instellingen',
	'Whole document': 'Volledig document',
	'Media library': 'Mediabibliotheek',
	'Choose image': 'Afbeelding kiezen',
	'Use image': 'Afbeelding gebruiken',
	'Pick tile photos': 'Tegelfoto’s kiezen',
	'Use photos': 'Foto’s gebruiken',
	Clear: 'Wissen',
	'%d photos loaded': '%d foto’s geladen',
	'Add at least %d photos - the more, the better the mosaic.':
		'Voeg minstens %d foto’s toe - hoe meer, hoe beter het mozaïek.',
	'Loading tiles…': 'Tegels laden…',
	Columns: 'Kolommen',
	'Color match': 'Kleuraanpassing',
	'0% = pure tile matching only': '0% = alleen zuivere tegelkeuze',
	'Rendering the mosaic': 'Mozaïek renderen',
	'Inserted.': 'Ingevoegd.',
	'Mosaic updated.': 'Mozaïek bijgewerkt.',
	'Could not insert the mosaic.': 'Kon het mozaïek niet invoegen.',
	'Could not load the image.': 'Kon de afbeelding niet laden.',
	'Everything is computed locally in your browser.':
		'Alles wordt lokaal in je browser berekend.',
};

const DICTS = { de: DE, es: ES, fr: FR, pt: PT, it: IT, nl: NL };
const DICT = DICTS[ LOCALE.slice( 0, 2 ) ] || null;
export const t = ( s ) => ( DICT && DICT[ s ] ) || s;
