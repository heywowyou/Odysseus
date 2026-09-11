import { describe, expect, it } from 'vitest';
import { formatHotelName, frenchOfHotel } from './hotel-name.js';

describe('formatHotelName', () => {
  it.each([
    ['HÔTEL DE LA POSTE', 'Hôtel de la Poste'],
    ['HÔTEL LES TEMPLIERS', 'Hôtel Les Templiers'],
    ['HÔTEL RESTAURANT LA BATISSE', 'Hôtel Restaurant La Batisse'],
    ['HÔTEL LE CHÂTEAU DE RAZAY', 'Hôtel Le Château de Razay'],
    ['HÔTEL DE LA CITÉ CARCASSONNE MGALLERY', 'Hôtel de la Cité Carcassonne Mgallery'],
    ["HÔTEL LA VILLA D'ELSA", "Hôtel La Villa d'Elsa"],
    ["BRIT HÔTEL L'HIPPODROME PLOERMEL", "Brit Hôtel L'Hippodrome Ploermel"],
    ['HÔTEL SAINT-JEAN', 'Hôtel Saint-Jean'],
    ['HÔTEL IBIS MONTCEAU-LES-MINES', 'Hôtel Ibis Montceau-les-Mines'],
    ['LE MANOIR HÔTEL', 'Le Manoir Hôtel'],
    ['HOTEL & SPA DES PECHEURS', 'Hotel & Spa des Pecheurs'],
    ['  HÔTEL   DU TIGRE ', 'Hôtel du Tigre'],
  ])('%s -> %s', (raw, expected) => {
    expect(formatHotelName(raw)).toBe(expected);
  });
});

describe('frenchOfHotel', () => {
  it.each([
    ['Hôtel des Tilleuls', "de l'Hôtel des Tilleuls"],
    ['Auberge du Moulin', "de l'Auberge du Moulin"],
    ['Domaine de Montjoie', 'du Domaine de Montjoie'],
    ['Villa Marie', 'de la Villa Marie'],
    ['Le Manoir Hôtel', 'du Manoir Hôtel'],
    ['Les Terrasses', 'des Terrasses'],
    ['La Belle Étoile', 'de la Belle Étoile'],
    ["L'Oustau", "de l'Oustau"],
    ['Chambres du Lac', 'des Chambres du Lac'],
    ['Best Western Plus Hôtel Masséna Nice', 'de Best Western Plus Hôtel Masséna Nice'],
  ])('%s -> %s', (name, expected) => {
    expect(frenchOfHotel(name)).toBe(expected);
  });
});
