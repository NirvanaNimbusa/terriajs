import i18next from "i18next";
import { action, computed, runInAction } from "mobx";
import createGuid from "terriajs-cesium/Source/Core/createGuid";
import RuntimeError from "terriajs-cesium/Source/Core/RuntimeError";
import isDefined from "../Core/isDefined";
import loadXML from "../Core/loadXML";
import replaceUnderscores from "../Core/replaceUnderscores";
import TerriaError from "../Core/TerriaError";
import AsyncMappableMixin from "../ModelMixins/AsyncMappableMixin";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import UrlMixin from "../ModelMixins/UrlMixin";
import GeoRssCatalogItemTraits from "../Traits/GeoRssCatalogItemTraits";
import CommonStrata from "./CommonStrata";
import CreateModel from "./CreateModel";
import GeoJsonCatalogItem from "./GeoJsonCatalogItem";
import LoadableStratum from "./LoadableStratum";
import Mappable from "./Mappable";
import { BaseModel } from "./Model";
import proxyCatalogItemUrl from "./proxyCatalogItemUrl";
import createInfoSection from "./createInfoSection";
import StratumOrder from "./StratumOrder";
import { geoRss2ToGeoJson, geoRssAtomToGeoJson } from "../Map/geoRssConvertor";
import getFilenameFromUri from "terriajs-cesium/Source/Core/getFilenameFromUri";

enum GeoRssFormat {
  RSS = "rss",
  ATOM = "feed"
}

interface Author {
  name?: string;
  email?: string;
  link?: string;
}

interface Feed {
  id?: string;
  title?: string;
  updated?: string;
  author?: Author;
  category?: string[];
  description?: string;
  contributor?: Author | Author[];
  generator?: string;
  link?: string[];
  copyright?: string;
  subtitle?: string;
}

interface ConvertedJson {
  geoJsonData: any;
  metadata: Feed;
}

class GeoRssStratum extends LoadableStratum(GeoRssCatalogItemTraits) {
  static stratumName = "georss";

  constructor(
    private readonly _item: GeoRssCatalogItem,
    private readonly _geoJsonItem: GeoJsonCatalogItem,
    private readonly _feed: Feed
  ) {
    super();
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new GeoRssStratum(
      newModel as GeoRssCatalogItem,
      this._geoJsonItem,
      this._feed
    ) as this;
  }

  get feedData(): Feed {
    return this._feed;
  }

  get geoJsonItem(): GeoJsonCatalogItem {
    return this._geoJsonItem;
  }

  static async load(item: GeoRssCatalogItem) {
    const geoJsonItem = new GeoJsonCatalogItem(createGuid(), item.terria);
    geoJsonItem.setTrait(
      CommonStrata.definition,
      "clampToGround",
      item.clampToGround
    );
    const feed: any = {};
    return Promise.resolve()
      .then(() => loadGeoRss(item))
      .then(json => {
        if (isDefined(json.geoJsonData)) {
          geoJsonItem.setTrait(
            CommonStrata.definition,
            "geoJsonData",
            json.geoJsonData
          );
        }
        geoJsonItem.loadMetadata();
        return json.metadata;
      })
      .then(feed => {
        const stratum = new GeoRssStratum(item, geoJsonItem, feed);
        return stratum;
      })
      .catch(e => {
        if (e instanceof TerriaError) {
          throw e;
        } else {
          throw new TerriaError({
            sender: this,
            title: i18next.t("models.georss.errorLoadingTitle"),
            message: i18next.t("models.georss.errorLoadingMessage", {
              appName: item.terria.appName,
              email:
                '<a href="mailto:' +
                item.terria.supportEmail +
                '">' +
                item.terria.supportEmail +
                "</a>.",
              stackTrace: e.stack || e.toString()
            })
          });
        }
      });
  }

  @computed get name(): string | undefined {
    if (this._feed.title && this._feed.title.length > 0) {
      return replaceUnderscores(this._feed.title);
    }
  }

  @computed get dataCustodian(): string | undefined {
    if (
      this._feed &&
      this._feed.author &&
      this._feed.author.name &&
      this._feed.author.name.length > 0
    ) {
      return this._feed.author.name;
    }
  }

  @computed get info() {
    return [
      createInfoSection(
        i18next.t("models.georss.subtitle"),
        this._feed.subtitle
      ),
      createInfoSection(
        i18next.t("models.georss.updated"),
        this._feed.updated?.toString()
      ),
      createInfoSection(
        i18next.t("models.georss.category"),
        this._feed.category?.join(", ")
      ),
      createInfoSection(
        i18next.t("models.georss.description"),
        this._feed.description
      ),
      createInfoSection(
        i18next.t("models.georss.copyrightText"),
        this._feed.copyright
      ),
      createInfoSection(
        i18next.t("models.georss.author"),
        this._feed.author?.name
      ),
      createInfoSection(
        i18next.t("models.georss.link"),
        typeof this._feed.link === "string"
          ? this._feed.link
          : this._feed.link?.join(", ")
      )
    ];
  }
}

StratumOrder.addLoadStratum(GeoRssStratum.stratumName);

export default class GeoRssCatalogItem
  extends AsyncMappableMixin(
    UrlMixin(CatalogMemberMixin(CreateModel(GeoRssCatalogItemTraits)))
  )
  implements Mappable {
  static readonly type = "georss";
  get type() {
    return GeoRssCatalogItem.type;
  }

  get typeName() {
    return i18next.t("models.georss.name");
  }

  get isMappable(): boolean {
    return true;
  }

  get canZoomTo(): boolean {
    return true;
  }

  get showsInfo(): boolean {
    return true;
  }

  protected forceLoadMetadata(): Promise<void> {
    return GeoRssStratum.load(this).then(stratum => {
      runInAction(() => {
        this.strata.set(GeoRssStratum.stratumName, stratum);
      });
    });
  }

  protected forceLoadMapItems(): Promise<void> {
    const that = this;
    return that.loadMetadata().then(() => {
      if (isDefined(that.geoJsonItem)) {
        return that.geoJsonItem.loadMapItems();
      }
    });
  }

  @computed get cacheDuration(): string {
    if (isDefined(super.cacheDuration)) {
      return super.cacheDuration;
    }
    return "1d";
  }

  @computed get geoJsonItem(): GeoJsonCatalogItem | undefined {
    const stratum = <GeoRssStratum>this.strata.get(GeoRssStratum.stratumName);
    return isDefined(stratum) ? stratum.geoJsonItem : undefined;
  }

  @computed get feedData(): Feed | undefined {
    const stratum = <GeoRssStratum>this.strata.get(GeoRssStratum.stratumName);
    return isDefined(stratum) ? stratum.feedData : undefined;
  }

  get mapItems() {
    if (isDefined(this.geoJsonItem)) {
      return this.geoJsonItem.mapItems.map(mapItem => {
        mapItem.show = this.show;
        return mapItem;
      });
    }
    return [];
  }
}

function loadGeoRss(item: GeoRssCatalogItem) {
  return new Promise<Document>(resolve => {
    if (isDefined(item.geoRssString)) {
      const parser = new DOMParser();
      resolve(parser.parseFromString(item.geoRssString, "text/xml"));
    } else if (isDefined(item.url)) {
      resolve(loadXML(proxyCatalogItemUrl(item, item.url)));
    } else {
      throw new TerriaError({
        sender: item,
        title: i18next.t("models.georss.unableToLoadItemTitle"),
        message: i18next.t("models.georss.unableToLoadItemMessage")
      });
    }
  }).then(xmlData => {
    const documentElement = xmlData.documentElement;

    if (documentElement.localName.includes(GeoRssFormat.ATOM)) {
      const jsonData: ConvertedJson = {
        geoJsonData: geoRssAtomToGeoJson(xmlData),
        metadata: parseMetadata(documentElement.childNodes, item)
      };
      return jsonData;
    } else if (documentElement.localName === GeoRssFormat.RSS) {
      const element = documentElement.getElementsByTagName("channel")[0];
      const jsonData: ConvertedJson = {
        geoJsonData: geoRss2ToGeoJson(xmlData),
        metadata: parseMetadata(element.childNodes, item)
      };
      return jsonData;
    } else {
      throw new RuntimeError("document is not valid");
    }
  });
}

function parseMetadata(
  xmlElements: NodeListOf<ChildNode>,
  item: GeoRssCatalogItem
) {
  const result: Feed = {};
  result.link = [];
  result.category = [];
  for (let i = 0; i < xmlElements.length; ++i) {
    const child = <Element>xmlElements[i];
    if (
      child.nodeType !== 1 ||
      child.localName === "item" ||
      child.localName === "entry"
    ) {
      continue;
    }
    if (child.localName === "id") {
      result.id = child.textContent || undefined;
    } else if (child.localName === "title") {
      result.title = child.textContent || undefined;
    } else if (child.localName === "subtitle") {
      result.subtitle = child.textContent || undefined;
    } else if (child.localName === "description") {
      result.description = child.textContent || undefined;
    } else if (child.localName === "category") {
      if (child.textContent) {
        result.category.push(child.textContent);
      }
    } else if (child.localName === "link") {
      if (child.textContent) {
        result.link.push(child.textContent);
      } else {
        const href = child.getAttribute("href");
        if (href) {
          result.link.push(href);
        }
      }
    } else if (child.localName === "updated") {
      result.updated = child.textContent || undefined;
    } else if (
      child.localName === "rights" ||
      child.localName === "copyright"
    ) {
      result.copyright = child.textContent || undefined;
    } else if (child.localName === "author") {
      const authorNode = child.childNodes;
      if (authorNode.length === 0) {
        result.author = {
          name: child.textContent || undefined
        };
      } else {
        let name, email, link;
        for (
          let authorIndex = 0;
          authorIndex < authorNode.length;
          ++authorIndex
        ) {
          const authorChild = <Element>authorNode[authorIndex];
          if (authorChild.nodeType === 1) {
            if (authorChild.localName === "name") {
              name = authorChild.textContent || undefined;
            } else if (authorChild.localName === "email") {
              email = authorChild.textContent || undefined;
            }
            if (authorChild.localName === "link") {
              link = authorChild.textContent || undefined;
            }
          }
        }
        result.author = {
          name: name,
          email: email,
          link: link
        };
      }
    }
  }
  if (item.url && (!isDefined(result.title) || result.title === item.url)) {
    result.title = getFilenameFromUri(item.url);
  }
  return result;
}