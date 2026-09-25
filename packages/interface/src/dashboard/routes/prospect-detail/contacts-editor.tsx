/** Websites, email addresses and stakeholders, inside the record editor
 *  (issue #532). */

import type { JSX } from 'react';
import { Pencil, Star, X } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { contactRemovalConfirm } from '../prospect-contact-model';
import type { ProspectDetailShared } from './shared';
import type { ContactActions } from './use-contact-actions';

export function ContactsEditor(props: {
  shared: ProspectDetailShared;
  contacts: ContactActions;
}): JSX.Element {
  const { prospect, copy, strings, saving, contactsCopy, stakeholders } = props.shared;
  const {
    website,
    setWebsite,
    email,
    setEmail,
    pendingRemoval,
    setPendingRemoval,
    newStakeholder,
    setNewStakeholder,
    stakeholderEdit,
    setStakeholderEdit,
    pendingStakeholderRemoval,
    setPendingStakeholderRemoval,
    saveWebsite,
    removeContact,
    choosePrimary,
    saveEmail,
    saveStakeholders,
    addStakeholder,
    saveStakeholderEdit,
  } = props.contacts;
  return (
    <>
      <div>
        <p className="mb-2 text-xs text-ink-muted">{copy.websites}</p>
        <ul className="grid gap-2">
          {prospect.websites.length > 0 ? (
            prospect.websites.map((item) => (
              <li key={item.url} className="flex flex-wrap items-center gap-2">
                <a
                  className="text-ink hover:underline"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.url}
                </a>
                {item.primary ? <Badge tone="accent">{copy.site}</Badge> : null}
                <span className="text-xs text-ink-muted">
                  {strings.prospectHub.directory.websiteKindLabels[item.kind] ??
                    strings.common.vocabularyFallback}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  {!item.primary ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => void choosePrimary('websites', item.url)}
                    >
                      <Star className="size-4" aria-hidden="true" />
                      {contactsCopy.setPrimaryWebsite}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={contactsCopy.removeWebsite.replace('{url}', item.url)}
                    onClick={() =>
                      setPendingRemoval({
                        kind: 'website',
                        url: item.url,
                        primary: item.primary,
                      })
                    }
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-ink-muted">{copy.noSite}</li>
          )}
        </ul>
        {prospect.contactSuggestion ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
            <p>
              {copy.contactSuggestion.replace('{address}', prospect.contactSuggestion.address)}{' '}
              <a
                href={prospect.contactSuggestion.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink-muted underline"
              >
                {copy.contactSuggestionSource}
              </a>
            </p>
            <Button
              variant="secondary"
              isLoading={saving}
              onClick={() => void saveEmail(prospect.contactSuggestion ?? undefined)}
            >
              {copy.contactSuggestionAccept}
            </Button>
          </div>
        ) : null}
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
          <Input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder={copy.addWebsitePlaceholder}
            aria-label={copy.addWebsite}
          />
          <Button isLoading={saving} disabled={!website.trim()} onClick={() => void saveWebsite()}>
            {copy.addWebsite}
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-ink-muted">{copy.emailList}</p>
        <ul className="grid gap-2">
          {prospect.emails.length > 0 ? (
            prospect.emails.map((item, index) => (
              <li key={item.address} className="flex flex-wrap items-center gap-2">
                <span className="break-all text-ink">{item.address}</span>
                <span className="text-xs text-ink-muted">
                  {copy.originLabels[item.origin] ?? strings.common.vocabularyFallback}
                </span>
                {index === 0 ? <Badge tone="accent">{contactsCopy.outreachRecipient}</Badge> : null}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {index !== 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => void choosePrimary('emails', item.address)}
                    >
                      {contactsCopy.useForOutreach}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPendingRemoval({
                        kind: 'email',
                        address: item.address,
                        blacklist: true,
                      })
                    }
                  >
                    {contactsCopy.removeAndBlacklistEmail}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={contactsCopy.removeEmail.replace('{address}', item.address)}
                    onClick={() =>
                      setPendingRemoval({
                        kind: 'email',
                        address: item.address,
                        blacklist: false,
                      })
                    }
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-ink-muted">{copy.notProvided}</li>
          )}
        </ul>
        {pendingRemoval !== null ? (
          <ConfirmDialog
            open
            onOpenChange={(open) => {
              if (!open) setPendingRemoval(null);
            }}
            {...contactRemovalConfirm(pendingRemoval, contactsCopy)}
            cancelLabel={strings.common.cancel}
            onConfirm={() => removeContact(pendingRemoval)}
          />
        ) : null}
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={copy.emailPlaceholder}
            aria-label={copy.email}
          />
          <Button isLoading={saving} disabled={!email.trim()} onClick={() => void saveEmail()}>
            {copy.addEmail}
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-ink-muted">{contactsCopy.stakeholders}</p>
        <ul className="grid gap-2">
          {stakeholders.length > 0 ? (
            stakeholders.map((item, index) =>
              stakeholderEdit?.index === index ? (
                <li key={`${index}-edit`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={stakeholderEdit.name}
                    onChange={(event) =>
                      setStakeholderEdit({ ...stakeholderEdit, name: event.target.value })
                    }
                    aria-label={contactsCopy.stakeholderName}
                  />
                  <Input
                    value={stakeholderEdit.position}
                    onChange={(event) =>
                      setStakeholderEdit({
                        ...stakeholderEdit,
                        position: event.target.value,
                      })
                    }
                    aria-label={contactsCopy.stakeholderPosition}
                  />
                  <span className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      isLoading={saving}
                      disabled={!stakeholderEdit.name.trim()}
                      onClick={() => void saveStakeholderEdit()}
                    >
                      {contactsCopy.saveStakeholder}
                    </Button>
                    <Button variant="ghost" onClick={() => setStakeholderEdit(null)}>
                      {strings.common.cancel}
                    </Button>
                  </span>
                </li>
              ) : (
                <li key={`${index}-${item.name}`} className="flex flex-wrap items-center gap-2">
                  <span className="text-ink">{item.name}</span>
                  {item.position !== undefined ? (
                    <span className="text-xs text-ink-muted">{item.position}</span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={contactsCopy.editStakeholder.replace('{name}', item.name)}
                      onClick={() =>
                        setStakeholderEdit({
                          index,
                          name: item.name,
                          position: item.position ?? '',
                        })
                      }
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={contactsCopy.removeStakeholder.replace('{name}', item.name)}
                      onClick={() => setPendingStakeholderRemoval(index)}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              ),
            )
          ) : (
            <li className="text-sm text-ink-muted">{copy.notProvided}</li>
          )}
        </ul>
        {pendingStakeholderRemoval !== null &&
        stakeholders[pendingStakeholderRemoval] !== undefined ? (
          <ConfirmDialog
            open
            onOpenChange={(open) => {
              if (!open) setPendingStakeholderRemoval(null);
            }}
            title={contactsCopy.removeStakeholderTitle}
            description={contactsCopy.removeStakeholderDescription.replace(
              '{name}',
              stakeholders[pendingStakeholderRemoval].name,
            )}
            confirmLabel={contactsCopy.confirmRemove}
            cancelLabel={strings.common.cancel}
            onConfirm={async () => {
              await saveStakeholders(pendingStakeholderRemoval, null);
              setStakeholderEdit(null);
            }}
          />
        ) : null}
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input
            value={newStakeholder.name}
            onChange={(event) => setNewStakeholder({ ...newStakeholder, name: event.target.value })}
            placeholder={contactsCopy.stakeholderName}
            aria-label={contactsCopy.stakeholderName}
          />
          <Input
            value={newStakeholder.position}
            onChange={(event) =>
              setNewStakeholder({ ...newStakeholder, position: event.target.value })
            }
            placeholder={contactsCopy.stakeholderPosition}
            aria-label={contactsCopy.stakeholderPosition}
          />
          <Button
            isLoading={saving}
            disabled={!newStakeholder.name.trim()}
            onClick={() => void addStakeholder()}
          >
            {contactsCopy.addStakeholder}
          </Button>
        </div>
      </div>
    </>
  );
}
