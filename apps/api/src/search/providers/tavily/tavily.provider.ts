import type { Env } from "../../../config/env.js";
import { hasTavilyKey } from "../../../config/env.js";
import {
  searchConfigurationError,
  searchProviderError,
  type SearchProvider,
} from "../../search.interface.js";
import { normalizeSearchResponse } from "../../search.normalizer.js";
import type { SearchInput, SearchResponse } from "../../search.types.js";
import { getTavilyClient } from "./tavily.client.js";
import { translateTavilyError } from "./tavily.errors.js";
import { fromTavilyResponse, toTavilySearchOptions } from "./tavily.mapper.js";

export class TavilySearchProvider implements SearchProvider {
  readonly name = "tavily";

  constructor(private readonly env: Env) {}

  async search(input: SearchInput): Promise<SearchResponse> {
    if (!hasTavilyKey(this.env)) {
      throw searchConfigurationError();
    }

    const client = getTavilyClient(this.env);
    const options = toTavilySearchOptions(input, this.env);

    try {
      const response = await client.search(input.query, options);

      if (!response || !Array.isArray(response.results)) {
        throw searchProviderError("Invalid Tavily search response shape");
      }

      const normalized = normalizeSearchResponse(fromTavilyResponse(response), {
        maxContentLength: this.env.SEARCH_MAX_CONTENT_LENGTH,
      });

      return normalized;
    } catch (error) {
      throw translateTavilyError(error);
    }
  }
}
