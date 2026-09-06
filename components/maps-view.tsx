"use client";

import { ChevronLeft, ChevronRight, Radio, RefreshCw, Search, Star } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { ServerMap } from "@/lib/types";

export interface MapsViewProps {
  maps: ServerMap[];
  total: number;
  currentMap: string;
  favorites: string[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  workshopId: string;
  setWorkshopId: (value: string) => void;
  onRefresh: () => void;
  onFavorite: (name: string) => void;
  onChange: (map: ServerMap) => void;
  onWorkshop: () => void;
}

function mapKey(map: ServerMap): string {
  return JSON.stringify([map.workshopId ?? null, map.name]);
}

function sortMaps(maps: ServerMap[], favorites: Set<string>): ServerMap[] {
  return [...maps].sort((a, b) =>
    Number(favorites.has(b.name)) - Number(favorites.has(a.name))
    || (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name)
    || mapKey(a).localeCompare(mapKey(b)),
  );
}

export function MapsView(props: MapsViewProps) {
  const { maps, currentMap, favorites, workshopId, setWorkshopId, onWorkshop, loading, search } = props;
  const [pageSize, setPageSize] = useState(10);
  const workshopInputId = useId();
  const favoriteNames = useMemo(() => new Set(favorites), [favorites]);
  const sorted = useMemo(() => sortMaps(maps, favoriteNames), [maps, favoriteNames]);
  const datasetKey = useMemo(() => JSON.stringify([search, maps.map((map) => [map.name, map.workshopId, map.displayName, map.category])]), [maps, search]);

  return (
    <div className="maps-workspace stack-lg">
      <section className="maps-context panel" aria-label="Current map and Workshop loader">
        <div className="maps-current">
          <span><Radio size={14} />Current map</span>
          <strong>{currentMap}</strong>
        </div>
        <form className="maps-workshop-form" onSubmit={(event) => {
          event.preventDefault();
          if (workshopId.trim() && !loading) onWorkshop();
        }}>
          <label htmlFor={workshopInputId}>Load a Workshop map</label>
          <div className="maps-workshop-input">
            <input id={workshopInputId} inputMode="numeric" value={workshopId} onChange={(event) => setWorkshopId(event.target.value.replace(/\D/g, ""))} aria-label="Workshop item ID" placeholder="Workshop item ID" maxLength={15} disabled={loading} />
            <button type="submit" className="button button--secondary" disabled={!workshopId.trim() || loading}>Load map</button>
          </div>
        </form>
      </section>
      <MapTable {...props} maps={sorted} datasetKey={datasetKey} favoriteNames={favoriteNames} pageSize={pageSize} setPageSize={setPageSize} />
    </div>
  );
}

type MapTableProps = MapsViewProps & {
  favoriteNames: Set<string>;
  datasetKey: string;
  pageSize: number;
  setPageSize: (value: number) => void;
};

function MapTable({ maps, total, currentMap, loading, search, setSearch, onRefresh, onFavorite, onChange, favoriteNames, datasetKey, pageSize, setPageSize }: MapTableProps) {
  const groupId = useId();
  const [view, setView] = useState<{ datasetKey: string; page: number; selectedId: string | null }>({ datasetKey, page: 0, selectedId: null });
  // Reset dependent state without remounting the toolbar's focused search field.
  if (view.datasetKey !== datasetKey) setView({ datasetKey, page: 0, selectedId: null });
  const page = view.datasetKey === datasetKey ? view.page : 0;
  const selectedId = view.datasetKey === datasetKey ? view.selectedId : null;
  const setPage = (value: number) => setView((current) => ({ ...current, page: value }));
  const setSelectedId = (value: string | null) => setView((current) => ({ ...current, selectedId: value }));
  const pageCount = Math.max(1, Math.ceil(maps.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const visibleMaps = maps.slice(start, start + pageSize);
  const selectedMap = selectedId ? maps.find((map) => mapKey(map) === selectedId) : undefined;
  const selectedCurrent = selectedMap?.name === currentMap;
  const toggleFavorite = (map: ServerMap) => {
    const nextFavorites = new Set(favoriteNames);
    if (nextFavorites.has(map.name)) nextFavorites.delete(map.name);
    else nextFavorites.add(map.name);
    const nextIndex = sortMaps(maps, nextFavorites).findIndex((item) => mapKey(item) === mapKey(map));
    // Keep the activated button mounted when favorite ordering crosses pages.
    setPage(Math.floor(Math.max(0, nextIndex) / pageSize));
    onFavorite(map.name);
  };

  return (
    <section className="maps-table-panel panel" aria-label="Installed maps">
      <div className="maps-toolbar">
        <div className="search-field maps-search"><Search size={16} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search maps" placeholder="Search installed maps" /></div>
        <div className="maps-toolbar-actions">
          <button className="button button--secondary" onClick={() => {
            setPage(0);
            setSelectedId(null);
            onRefresh();
          }} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />Sync server maps</button>
          <button className="button button--primary" onClick={() => {
            if (selectedMap && !selectedCurrent && !loading) onChange(selectedMap);
          }} disabled={!selectedMap || selectedCurrent || loading}>Change level</button>
        </div>
      </div>
      <div className="maps-selection" aria-live="polite">
        {selectedMap ? <><span>Selected map</span><strong>{selectedMap.displayName ?? selectedMap.name}</strong>{selectedCurrent && <small>Already playing</small>}</> : <span>Select a map below, then change level.</span>}
      </div>

      <fieldset className="maps-table-fieldset">
        <legend className="sr-only">Select one map to change level</legend>
        <div className="maps-table-scroll">
          <table className="maps-table" aria-label="Server map list" aria-busy={loading}>
            <thead><tr><th scope="col" className="maps-select-column"><span className="sr-only">Select map</span></th><th scope="col">Map</th><th scope="col">Type</th><th scope="col">Workshop ID</th><th scope="col" className="maps-favorite-column"><span className="sr-only">Favorite</span></th></tr></thead>
            <tbody>
              {visibleMaps.map((map, index) => {
                const key = mapKey(map);
                const displayName = map.displayName ?? map.name;
                const selected = selectedId === key;
                const isCurrent = map.name === currentMap;
                const favorite = favoriteNames.has(map.name);
                const radioId = `${groupId}-map-${index}`;
                return (
                  <tr key={key} className={selected ? "is-selected" : undefined} onClick={(event) => {
                    if (!(event.target as Element).closest("button,a,input,label")) setSelectedId(key);
                  }}>
                    <td className="maps-select-column"><input type="radio" id={radioId} name={groupId} value={key} checked={selected} onChange={() => setSelectedId(key)} aria-label={`Select ${displayName}${map.workshopId ? ` (Workshop ${map.workshopId})` : ""}`} /></td>
                    <td><div className="maps-name"><label htmlFor={radioId}>{displayName}</label>{isCurrent && <span className="maps-current-badge">Current</span>}</div>{displayName !== map.name && <code className="maps-internal-name">{map.name}</code>}</td>
                    <td><span className="maps-type">{map.category}</span></td>
                    <td>{map.workshopId ? <code className="maps-workshop-id">{map.workshopId}</code> : <span className="maps-no-workshop" aria-label="No Workshop ID">—</span>}</td>
                    <td className="maps-favorite-column"><button className={`icon-button maps-favorite ${favorite ? "is-favorite" : ""}`} onClick={() => toggleFavorite(map)} aria-pressed={favorite} aria-label={`${favorite ? "Remove" : "Add"} ${displayName} ${favorite ? "from" : "to"} favorites`}><Star size={16} fill={favorite ? "currentColor" : "none"} /></button></td>
                  </tr>
                );
              })}
              {!visibleMaps.length && <tr className="maps-empty-row"><td colSpan={5}><strong>{search.trim() ? "No matching maps" : "No maps loaded"}</strong><p>{search.trim() ? "Try another map name or Workshop ID." : "Sync the server to load its installed maps."}</p></td></tr>}
            </tbody>
          </table>
        </div>
      </fieldset>

      <footer className="maps-pagination">
        <p className="maps-count" aria-live="polite">{maps.length ? `${start + 1}–${Math.min(start + pageSize, maps.length)} of ${maps.length}` : "0"} {search.trim() ? "matching maps" : "maps"}{total !== maps.length && <span>{total} installed</span>}</p>
        <div className="maps-pagination-controls">
          <label>Rows per page<select value={pageSize} onChange={(event) => { setPage(0); setPageSize(Number(event.target.value)); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
          <span className="maps-page-number">Page {currentPage + 1} of {pageCount}</span>
          <div className="maps-page-buttons">
            <button className="icon-button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous page"><ChevronLeft size={17} /></button>
            <button className="icon-button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next page"><ChevronRight size={17} /></button>
          </div>
        </div>
      </footer>
    </section>
  );
}
