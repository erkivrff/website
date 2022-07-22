import React from 'react';
import {
  Tooltip,
  IconButton,
  Dialog,
  DialogTrigger,
  DialogContent,
  TextField,
  Box,
} from '@modulz/design-system';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import algoliasearch from 'algoliasearch';
import { createAutocomplete } from '@algolia/autocomplete-core';
import type { SearchClient } from 'algoliasearch/lite';
import { DocSearchHit, InternalDocSearchHit } from '@docsearch/react/dist/esm/types';
import type { AutocompleteState } from '@algolia/autocomplete-core';

function Search() {
  return (
    <Dialog>
      <Tooltip content="Search">
        <DialogTrigger asChild>
          <IconButton css={{ mr: '-$2' }}>
            <MagnifyingGlassIcon />
          </IconButton>
        </DialogTrigger>
      </Tooltip>
      <SearchDialogContent />
    </Dialog>
  );
}

const ALGOLIA_APP_ID = '36WT60VAD2';
const ALGOLIA_API_KEY = '4b0ea81fe7e54fc245b3cffa682046f8';
const ALGOLIA_INDEX_NAME = 'radix-ui';
const SNIPPET_LENGTH = 10;

const searchClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

function SearchDialogContent() {
  const inputRef = React.useRef(null);
  const [state, setState] = React.useState<AutocompleteState<InternalDocSearchHit>>({
    query: '',
    collections: [],
    completion: null,
    context: {},
    isOpen: false,
    activeItemId: null,
    status: 'idle',
  });

  const autocomplete = React.useMemo(
    () =>
      createAutocomplete<
        InternalDocSearchHit,
        React.FormEvent<HTMLFormElement>,
        React.MouseEvent,
        React.KeyboardEvent
      >({
        id: 'docsearch',
        defaultActiveItemId: 0,
        placeholder: 'dialog, popover, …',
        openOnFocus: true,
        initialState: { query: '', context: { searchSuggestions: [] } },
        onStateChange(props) {
          setState(props.state);
        },
        getSources({ query, state: sourcesState, setContext, setStatus }) {
          if (!query) return [];

          return searchClient
            .search<DocSearchHit>([
              {
                query,
                indexName: ALGOLIA_INDEX_NAME,
                params: {
                  attributesToRetrieve: [
                    'hierarchy.lvl0',
                    'hierarchy.lvl1',
                    'hierarchy.lvl2',
                    'hierarchy.lvl3',
                    'hierarchy.lvl4',
                    'hierarchy.lvl5',
                    'hierarchy.lvl6',
                    'content',
                    'type',
                    'url',
                  ],
                  attributesToSnippet: [
                    `hierarchy.lvl1:${SNIPPET_LENGTH}`,
                    `hierarchy.lvl2:${SNIPPET_LENGTH}`,
                    `hierarchy.lvl3:${SNIPPET_LENGTH}`,
                    `hierarchy.lvl4:${SNIPPET_LENGTH}`,
                    `hierarchy.lvl5:${SNIPPET_LENGTH}`,
                    `hierarchy.lvl6:${SNIPPET_LENGTH}`,
                    `content:${SNIPPET_LENGTH}`,
                  ],
                  snippetEllipsisText: '…',
                  highlightPreTag: '<mark>',
                  highlightPostTag: '</mark>',
                  hitsPerPage: 20,
                },
              },
            ])
            .catch((error) => {
              // The Algolia `RetryError` happens when all the servers have
              // failed, meaning that there's no chance the response comes
              // back. This is the right time to display an error.
              // See https://github.com/algolia/algoliasearch-client-javascript/blob/2ffddf59bc765cd1b664ee0346b28f00229d6e12/packages/transporter/src/errors/createRetryError.ts#L5
              if (error.name === 'RetryError') {
                setStatus('error');
              }

              throw error;
            })
            .then(({ results }) => {
              const { hits, nbHits } = results[0];
              const sources = groupBy(hits, (hit) => removeHighlightTags(hit));

              // We store the `lvl0`s to display them as search suggestions
              // in the "no results" screen.
              if (
                (sourcesState.context.searchSuggestions as any[]).length <
                Object.keys(sources).length
              ) {
                setContext({
                  searchSuggestions: Object.keys(sources),
                });
              }

              setContext({ nbHits });

              return Object.values<DocSearchHit[]>(sources).map((items, index) => {
                return {
                  sourceId: `hits${index}`,
                  onSelect({ item, event }) {
                    // if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
                    //   onClose();
                    // }
                  },
                  getItemUrl({ item }) {
                    return item.url;
                  },
                  getItems() {
                    return Object.values(groupBy(items, (item) => item.hierarchy.lvl1))
                      .map((groupedHits) =>
                        groupedHits.map((item) => {
                          return {
                            ...item,
                            __docsearch_parent:
                              item.type !== 'lvl1' &&
                              groupedHits.find(
                                (siblingItem) =>
                                  siblingItem.type === 'lvl1' &&
                                  siblingItem.hierarchy.lvl1 === item.hierarchy.lvl1
                              ),
                          };
                        })
                      )
                      .flat();
                  },
                };
              });
            });
        },
      }),
    []
  );

  return (
    <DialogContent
      css={{
        top: '$9',
        mt: 0,
        width: 500,
        maxHeight: 'calc(100vh - $9 - $5)',
        transform: 'translate(-50%, 0)',

        '@media (max-width:750px)': {
          borderRadius: '0',
          boxShadow: 'none',
          top: 0,
          left: 0,
          transform: 'none',
          height: '100%',
          maxHeight: 'calc(var(--docsearch-vh, 1vh)*100)',
          maxWidth: '100%',
          width: '100%',
          padding: '$3',
        },
      }}
    >
      <TextField
        ref={inputRef}
        size="2"
        {...autocomplete.getInputProps({ inputElement: inputRef.current })}
      />
    </DialogContent>
  );
}

export function groupBy<TValue extends Record<string, unknown>>(
  values: TValue[],
  predicate: (value: TValue) => string
): Record<string, TValue[]> {
  return values.reduce<Record<string, TValue[]>>((acc, item) => {
    const key = predicate(item);

    if (!acc.hasOwnProperty(key)) {
      acc[key] = [];
    }

    // We limit each section to show 5 hits maximum.
    // This acts as a frontend alternative to `distinct`.
    if (acc[key].length < 5) {
      acc[key].push(item);
    }

    return acc;
  }, {});
}

const regexHighlightTags = /(<mark>|<\/mark>)/g;
const regexHasHighlightTags = RegExp(regexHighlightTags.source);

export function removeHighlightTags(hit: DocSearchHit | InternalDocSearchHit): string {
  const internalDocSearchHit = hit as InternalDocSearchHit;

  if (!internalDocSearchHit.__docsearch_parent && !hit._highlightResult) {
    return hit.hierarchy.lvl0;
  }

  const { value } =
    (internalDocSearchHit.__docsearch_parent
      ? internalDocSearchHit.__docsearch_parent?._highlightResult?.hierarchy?.lvl0
      : hit._highlightResult?.hierarchy?.lvl0) || {};

  return value && regexHasHighlightTags.test(value) ? value.replace(regexHighlightTags, '') : value;
}

export { Search };
