import { useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { useI18n } from '../i18n/provider';
import {
  activeAdvancedFilterEntries,
  activeFilterCount,
  type ProspectFilterKey,
  type ProspectFilterSource,
  type ProspectFilterState,
} from './prospect-filter-model';

interface StatusOption {
  value: string;
  label: string;
}

export function ProspectFilterBar(props: {
  source: ProspectFilterSource;
  state: ProspectFilterState;
  onChange: (key: ProspectFilterKey, value: string) => void;
  onClear: () => void;
  statusOptions?: readonly StatusOption[];
  allStatusesLabel?: string;
  statusAriaLabel?: string;
}): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.prospectHub.filters;
  const listCopy = strings.prospectHub.list;
  const directoryCopy = strings.prospectHub.directory;
  const {
    source,
    state,
    onChange,
    onClear,
    statusOptions = [],
    allStatusesLabel = listCopy.allStatuses,
    statusAriaLabel = listCopy.statusFilterAria,
  } = props;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeCount = activeFilterCount(state, source);
  const labels: Partial<Record<ProspectFilterKey, string>> = {
    sector: copy.sectorPlaceholder,
    stars: copy.allStars,
    groupStatus: copy.allGroups,
    websiteKind: copy.allWebsiteKinds,
    department: copy.departmentPlaceholder,
    commune: copy.communePlaceholder,
    postcode: copy.postcodePlaceholder,
    roomsMin: copy.roomsMinPlaceholder,
    roomsMax: copy.roomsMaxPlaceholder,
    hasScan: copy.allScans,
    inactive: copy.allActivity,
  };
  const valueLabel = (key: ProspectFilterKey, value: string): string => {
    if (key === 'groupStatus') return directoryCopy.groupLabels[value] ?? value;
    if (key === 'websiteKind') return directoryCopy.websiteKindLabels[value] ?? value;
    return `${labels[key] ?? key}: ${value}`;
  };
  const advancedEntries = activeAdvancedFilterEntries(state, source, labels);
  const field =
    (key: ProspectFilterKey) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange(key, event.target.value);

  return (
    <Card className="mb-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-muted"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            value={state.q}
            onChange={field('q')}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchAria}
          />
        </label>
        {source === 'prospects' ? (
          <Select value={state.status} onChange={field('status')} aria-label={statusAriaLabel}>
            <option value="">{allStatusesLabel}</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : (
          <Select value={state.stars} onChange={field('stars')} aria-label={copy.starsAria}>
            <option value="">{copy.allStars}</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {copy.starOption.replace('{count}', String(value))}
              </option>
            ))}
          </Select>
        )}
        {source === 'directory' ? (
          <Input
            value={state.department}
            onChange={field('department')}
            placeholder={copy.departmentPlaceholder}
            aria-label={copy.departmentAria}
          />
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {copy.advanced.replace('{count}', String(activeCount))}
        </Button>
      </div>
      {advancedEntries.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label={copy.activeFilters}>
          {advancedEntries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-accent-tint px-2 py-1 text-xs text-ink"
              onClick={() => onChange(entry.key, '')}
              aria-label={copy.removeFilter.replace('{filter}', valueLabel(entry.key, entry.value))}
            >
              {valueLabel(entry.key, entry.value)}
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {copy.clearAll}
          </Button>
        </div>
      ) : null}
      {advancedOpen ? (
        <div className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            value={state.sector}
            onChange={field('sector')}
            placeholder={copy.sectorPlaceholder}
            aria-label={copy.sectorAria}
          />
          {source === 'prospects' ? (
            <>
              <Select value={state.stars} onChange={field('stars')} aria-label={copy.starsAria}>
                <option value="">{copy.allStars}</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {copy.starOption.replace('{count}', String(value))}
                  </option>
                ))}
              </Select>
              <Input
                value={state.department}
                onChange={field('department')}
                placeholder={copy.departmentPlaceholder}
                aria-label={copy.departmentAria}
              />
            </>
          ) : null}
          <Select
            value={state.groupStatus}
            onChange={field('groupStatus')}
            aria-label={copy.groupAria}
          >
            <option value="">{copy.allGroups}</option>
            {Object.entries(directoryCopy.groupLabels).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
          <Select
            value={state.websiteKind}
            onChange={field('websiteKind')}
            aria-label={copy.websiteAria}
          >
            <option value="">{copy.allWebsiteKinds}</option>
            {Object.entries(directoryCopy.websiteKindLabels).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
          <Input
            value={state.commune}
            onChange={field('commune')}
            placeholder={copy.communePlaceholder}
            aria-label={copy.communeAria}
          />
          {source === 'directory' ? (
            <Input
              value={state.postcode}
              onChange={field('postcode')}
              placeholder={copy.postcodePlaceholder}
              aria-label={copy.postcodeAria}
            />
          ) : null}
          <Input
            type="number"
            min="0"
            value={state.roomsMin}
            onChange={field('roomsMin')}
            placeholder={copy.roomsMinPlaceholder}
            aria-label={copy.roomsMinAria}
          />
          <Input
            type="number"
            min="0"
            value={state.roomsMax}
            onChange={field('roomsMax')}
            placeholder={copy.roomsMaxPlaceholder}
            aria-label={copy.roomsMaxAria}
          />
          {source === 'prospects' ? (
            <>
              <Select value={state.hasScan} onChange={field('hasScan')} aria-label={copy.scanAria}>
                <option value="">{copy.allScans}</option>
                <option value="true">{copy.withScan}</option>
                <option value="false">{copy.withoutScan}</option>
              </Select>
              <Select
                value={state.inactive}
                onChange={field('inactive')}
                aria-label={copy.activityAria}
              >
                <option value="">{copy.allActivity}</option>
                <option value="false">{copy.activeOnly}</option>
                <option value="true">{copy.inactiveOnly}</option>
              </Select>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
