/**
 * Built-in equipment catalog behind the blade / rubber pickers: real-world blades and rubbers with
 * Chinese + English names, search aliases (abbreviations such as `vis`, `w968`, `hl5`, `fzd`, `zjk`,
 * `h3`, `t05`, `d09c`), blade constructions and per-rubber thickness / hardness presets.
 *
 * The pickers always accept free text as well, so the catalog only needs to cover common gear.
 * Pure data + helpers (no React), safe to import anywhere.
 */

export type BrandId =
  | "butterfly"
  | "dhs"
  | "stiga"
  | "tibhar"
  | "xiom"
  | "nittaku"
  | "yasaka"
  | "victas"
  | "donic"
  | "andro"
  | "friendship"
  | "yinhe"
  | "sanwei"
  | "darker";

export type CatalogBrand = {
  id: BrandId;
  /** Chinese short name, shown on the brand filter pills. */
  name: string;
  /** English name. */
  en: string;
  /** Prefix of the value inserted into the form, e.g. `Butterfly Viscaria (维斯卡利亚)` / `红双喜 狂飚龙5 (...)`. */
  label: string;
  aliases?: string[];
};

/** Filter pills follow this order. */
export const CATALOG_BRANDS: readonly CatalogBrand[] = [
  { id: "butterfly", name: "蝴蝶", en: "Butterfly", label: "Butterfly", aliases: ["bty", "tamca"] },
  { id: "dhs", name: "红双喜", en: "DHS", label: "红双喜", aliases: ["double happiness"] },
  { id: "stiga", name: "斯帝卡", en: "Stiga", label: "Stiga", aliases: ["斯蒂卡"] },
  { id: "tibhar", name: "挺拔", en: "Tibhar", label: "Tibhar" },
  { id: "xiom", name: "骄猛", en: "XIOM", label: "XIOM" },
  { id: "nittaku", name: "尼塔库", en: "Nittaku", label: "Nittaku" },
  { id: "yasaka", name: "亚萨卡", en: "Yasaka", label: "Yasaka" },
  { id: "victas", name: "维克塔斯", en: "Victas", label: "Victas", aliases: ["tsp"] },
  { id: "donic", name: "多尼克", en: "Donic", label: "Donic" },
  { id: "andro", name: "岸度", en: "Andro", label: "Andro" },
  { id: "friendship", name: "729", en: "729 Friendship", label: "729", aliases: ["友谊", "friendship", "ritc"] },
  { id: "yinhe", name: "银河", en: "Yinhe", label: "银河", aliases: ["galaxy", "milky way"] },
  { id: "sanwei", name: "三维", en: "Sanwei", label: "三维" },
  { id: "darker", name: "达克", en: "Darker", label: "Darker" },
];

const BRAND_BY_ID = Object.fromEntries(CATALOG_BRANDS.map((brand) => [brand.id, brand])) as Record<BrandId, CatalogBrand>;

export function getCatalogBrand(id: BrandId): CatalogBrand {
  return BRAND_BY_ID[id];
}

export type BladeCategory = "纯木" | "外置芳碳" | "内置芳碳" | "外置碳素" | "内置碳素" | "外置超级纤维" | "内置超级纤维";

export type RubberCategory = "反胶" | "生胶" | "长胶";

type CatalogEntryBase = {
  id: string;
  brand: BrandId;
  /** Display name: model plus its other-language name in parentheses. */
  name: string;
  /** Extra search keys: nicknames, abbreviations, other spellings. */
  aliases: string[];
};

export type BladeEntry = CatalogEntryBase & {
  /** Construction; omitted when not certain. */
  category?: BladeCategory;
};

export type RubberEntry = CatalogEntryBase & {
  category: RubberCategory;
  /** Commonly boosted before gluing (Chinese tacky rubbers): preselects 「初始已灌油」. */
  defaultBoosted?: boolean;
  /** Sponge thicknesses the rubber is sold in, mm. */
  thicknessOptions: number[];
  /** Sponge hardnesses the rubber is sold in (degrees as printed by the maker). */
  hardnessOptions?: string[];
};

export type CatalogEntry = BladeEntry | RubberEntry;

// ---------------------------------------------------------------------------
// Blades
// ---------------------------------------------------------------------------

const blade = (brand: BrandId, id: string, name: string, category: BladeCategory | undefined, aliases: string[] = []): BladeEntry => ({
  id: `blade-${brand}-${id}`,
  brand,
  name,
  ...(category ? { category } : {}),
  aliases,
});

export const BLADE_CATALOG: readonly BladeEntry[] = [
  // Butterfly 蝴蝶
  blade("butterfly", "viscaria", "Viscaria (维斯卡利亚)", "外置芳碳", ["vis", "维斯", "维斯卡利亚", "viscaria alc"]),
  blade("butterfly", "viscaria-super-alc", "Viscaria Super ALC (维斯卡利亚 Super ALC)", "外置芳碳", ["vis salc", "vis super alc", "维斯 salc", "维斯超级芳碳"]),
  blade("butterfly", "fzd-alc", "Fan Zhendong ALC (樊振东 ALC)", "外置芳碳", ["fzd", "fzd alc", "樊振东", "樊振东alc", "小胖"]),
  blade("butterfly", "fzd-super-alc", "Fan Zhendong Super ALC (樊振东 Super ALC)", "外置芳碳", ["fzd salc", "fzd super alc", "樊振东 salc", "樊振东超级芳碳"]),
  blade("butterfly", "fzd-zlc", "Fan Zhendong ZLC (樊振东 ZLC)", "外置超级纤维", ["fzd zlc", "樊振东 zlc"]),
  blade("butterfly", "fzd-super-zlc", "Fan Zhendong Super ZLC (樊振东 Super ZLC)", "外置超级纤维", ["fzd szlc", "fzd super zlc", "樊振东 szlc"]),
  blade("butterfly", "harimoto-alc", "Harimoto Innerforce ALC (张本智和 Innerforce ALC)", "内置芳碳", ["harimoto", "张本", "张本智和", "张本 alc", "hifalc"]),
  blade("butterfly", "harimoto-super-zlc", "Harimoto Innerforce Super ZLC (张本智和 Innerforce Super ZLC)", "内置超级纤维", ["harimoto szlc", "张本 szlc", "张本 super zlc"]),
  blade("butterfly", "harimoto-zlc", "Harimoto Innerforce ZLC (张本智和 Innerforce ZLC)", "内置超级纤维", ["harimoto zlc", "张本 zlc"]),
  blade("butterfly", "lgy-alc", "Lin Gaoyuan ALC (林高远 ALC)", "外置芳碳", ["lgy", "lgy alc", "林高远", "林高远alc"]),
  blade("butterfly", "tb-alc", "Timo Boll ALC (波尔 ALC)", "外置芳碳", ["tb alc", "tbalc", "波尔", "波尔alc", "timo boll"]),
  blade("butterfly", "tb-spirit", "Timo Boll Spirit (波尔精神)", "外置芳碳", ["tb spirit", "tbs", "波尔精神"]),
  blade("butterfly", "tb-zlc", "Timo Boll ZLC (波尔 ZLC)", "外置超级纤维", ["tb zlc", "tbzlc", "波尔zlc"]),
  blade("butterfly", "ovtcharov-alc", "Ovtcharov Innerforce ALC (奥恰洛夫 ALC)", "内置芳碳", ["ovtcharov", "奥恰", "奥恰洛夫", "ov alc"]),
  blade("butterfly", "franziska-zlc", "Franziska Innerforce ZLC (弗朗西斯卡 ZLC)", "内置超级纤维", ["franziska", "弗朗西斯卡", "弗朗", "fiz"]),
  blade("butterfly", "mizutani-zlc", "Mizutani Jun ZLC (水谷隼 ZLC)", "外置超级纤维", ["mizutani", "水谷隼", "水谷", "mj zlc"]),
  blade("butterfly", "mizutani-super-zlc", "Mizutani Jun Super ZLC (水谷隼 Super ZLC)", "外置超级纤维", ["mizutani szlc", "水谷 szlc"]),
  blade("butterfly", "zjk-alc", "Zhang Jike ALC (张继科 ALC)", "外置芳碳", ["zjk", "zjk alc", "张继科", "张继科alc"]),
  blade("butterfly", "zjk-super-zlc", "Zhang Jike Super ZLC (张继科 Super ZLC)", "外置超级纤维", ["zjk szlc", "zjk super zlc", "张继科 szlc"]),
  blade("butterfly", "innerforce-alc", "Innerforce Layer ALC (内置芳碳 ALC)", "内置芳碳", ["innerforce alc", "ifalc", "il alc", "内能alc"]),
  blade("butterfly", "innerforce-zlc", "Innerforce Layer ZLC (内置超级纤维 ZLC)", "内置超级纤维", ["innerforce zlc", "ifzlc", "il zlc"]),
  blade("butterfly", "garaydia-alc", "Garaydia ALC (加雷迪亚 ALC)", "外置芳碳", ["garaydia"]),
  blade("butterfly", "primorac-carbon", "Primorac Carbon (普里莫拉茨碳)", "外置碳素", ["primorac", "普碳", "pc"]),
  blade("butterfly", "korbel", "Korbel (科贝尔)", "纯木", ["korbel", "科贝尔"]),
  blade("butterfly", "joo-se-hyuk", "Joo Se Hyuk (朱世赫)", "纯木", ["joo se hyuk", "朱世赫", "削球"]),
  blade("butterfly", "diode", "Diode V (迪奥德)", "纯木", ["diode"]),

  // DHS 红双喜
  blade("dhs", "hurricane-long-5", "狂飚龙5 (Hurricane Long 5)", "内置芳碳", ["hl5", "h-l5", "龙5", "hurricane long 5", "long5"]),
  blade("dhs", "hurricane-long-5x", "狂飚龙5X (Hurricane Long 5X)", "内置芳碳", ["hl5x", "h-l5x", "龙5x", "hurricane long 5x"]),
  blade("dhs", "w968", "狂飚龙5 W968 (马龙特制)", "内置芳碳", ["w968", "马龙", "特制龙5", "数字龙5", "字母龙5", "龙5 w968"]),
  blade("dhs", "q968", "狂飚 王楚钦 Q968 (Wang Chuqin)", "内置芳碳", ["q968", "王楚钦", "wcq", "wang chuqin"]),
  blade("dhs", "hurricane-sa", "狂飚飒 (Hurricane Sun 孙颖莎)", "内置芳碳", ["狂飚飒", "飒", "孙颖莎", "hurricane sun", "hurricane sa", "狂飚颯"]),
  blade("dhs", "hurricane-king", "狂飚王 (Hurricane King)", "纯木", ["hurricane king", "狂飚王", "hk"]),
  blade("dhs", "hurricane-king-3", "狂飚王3 (Hurricane King III)", "内置芳碳", ["hurricane king 3", "狂飚王3", "hk3"]),
  blade("dhs", "hurricane-hao", "狂飚皓 (Hurricane Hao)", "纯木", ["hurricane hao", "狂飚皓", "皓", "狂飚皓2"]),
  blade("dhs", "hurricane-hao-3", "狂飚皓3 (Hurricane Hao III)", "内置芳碳", ["hurricane hao 3", "狂飚皓3", "皓3"]),
  blade("dhs", "hurricane-bo-b2x", "狂飚博芳碳 B2X (Hurricane Bo)", "内置芳碳", ["b2x", "b2", "狂飚博", "博芳碳", "hurricane bo", "hurricane bo 2"]),
  blade("dhs", "hurricane-301", "狂飚301 (Hurricane 301)", "内置芳碳", ["h301", "301", "hurricane 301"]),
  blade("dhs", "hurricane-301x", "狂飚301X (Hurricane 301X)", "内置芳碳", ["h301x", "301x"]),
  blade("dhs", "hurricane-301z", "狂飚301Z (Hurricane 301Z)", "内置超级纤维", ["h301z", "301z"]),
  blade("dhs", "pg7", "劲极7 (PG7)", "纯木", ["pg7", "劲极7", "劲极"]),

  // Stiga 斯帝卡
  blade("stiga", "cybershape-carbon", "Cybershape Carbon (六边形碳素)", "内置碳素", ["cybershape", "cs carbon", "六边形", "六角碳", "莫雷高德"]),
  blade("stiga", "cybershape-wood", "Cybershape Wood (六边形纯木)", "纯木", ["cybershape wood", "六边形纯木", "六角纯木"]),
  blade("stiga", "dynasty-carbon", "Dynasty Carbon (王朝碳素)", "外置碳素", ["dynasty", "王朝", "王朝碳素", "许昕", "许昕蓝标", "蓝标"]),
  blade("stiga", "carbonado-45", "Carbonado 45 (卡博纳多 45)", "外置碳素", ["carbonado 45", "cbd45", "卡博纳多45"]),
  blade("stiga", "carbonado-90", "Carbonado 90 (卡博纳多 90)", "外置碳素", ["carbonado 90", "cbd90", "卡博纳多90"]),
  blade("stiga", "carbonado-145", "Carbonado 145 (卡博纳多 145)", "外置碳素", ["carbonado 145", "cbd145"]),
  blade("stiga", "carbonado-190", "Carbonado 190 (卡博纳多 190)", "外置碳素", ["carbonado 190", "cbd190"]),
  blade("stiga", "inspira-hybrid-carbon", "Inspira Hybrid Carbon (灵感碳素)", "外置芳碳", ["inspira", "灵感", "灵感碳素"]),
  blade("stiga", "clipper-cr", "Clipper CR (克利伯 CR)", "纯木", ["clipper cr", "cr wrb", "斯帝卡 cr"]),
  blade("stiga", "clipper-cl", "Clipper CL (斯帝卡 CL)", "纯木", ["clipper", "cl", "斯帝卡cl", "clipper wood"]),
  blade("stiga", "offensive-classic", "Offensive Classic (OC)", "纯木", ["oc", "offensive classic", "斯帝卡oc"]),
  blade("stiga", "ebenholz-5", "Ebenholz NCT V (黑檀5)", "纯木", ["ebenholz", "ebenholz v", "ebenholz 5", "黑檀5", "黑檀"]),
  blade("stiga", "ebenholz-7", "Ebenholz NCT VII (黑檀7)", "纯木", ["ebenholz vii", "ebenholz 7", "黑檀7"]),
  blade("stiga", "rosewood-5", "Rosewood NCT V (玫瑰5)", "纯木", ["rosewood", "rosewood v", "rosewood 5", "玫瑰5", "玫瑰"]),
  blade("stiga", "rosewood-7", "Rosewood NCT VII (玫瑰7)", "纯木", ["rosewood vii", "rosewood 7", "玫瑰7"]),
  blade("stiga", "infinity-vps-v", "Infinity VPS V (钻石5)", "纯木", ["infinity", "vps", "钻石5", "钻石"]),

  // Tibhar 挺拔
  blade("tibhar", "shang-kun-ac", "Shang Kun Hybrid AC (尚坤 AC)", "内置芳碳", ["shang kun", "尚坤", "尚坤ac"]),
  blade("tibhar", "shang-kun-zc", "Shang Kun Hybrid ZC (尚坤 ZC)", "内置超级纤维", ["shang kun zc", "尚坤zc"]),
  blade("tibhar", "lebrun-hybrid-carbon", "Lebrun Hybrid Carbon (勒布伦)", "内置芳碳", ["lebrun", "勒布伦", "felix lebrun"]),
  blade("tibhar", "sfpbe", "Samsonov Force Pro Black Edition (黑萨)", "纯木", ["sfpbe", "黑萨", "萨姆索诺夫", "samsonov", "force pro"]),
  blade("tibhar", "stratus-power-wood", "Stratus Power Wood (斯特拉图斯纯木)", "纯木", ["stratus", "power wood", "spw"]),

  // XIOM 骄猛
  blade("xiom", "hugo-hal", "Hugo HAL (雨果 HAL)", "外置超级纤维", ["hugo", "雨果", "hugo hal", "卡尔德拉诺"]),
  blade("xiom", "hugo-tmxi", "Hugo TMXi (雨果 TMXi)", "内置芳碳", ["hugo tmxi", "雨果tmxi", "tmxi"]),
  blade("xiom", "ice-cream-azx", "Ice Cream AZX (冰淇淋 AZX)", "外置芳碳", ["ice cream", "冰淇淋", "azx"]),
  blade("xiom", "ice-cream-azxi", "Ice Cream AZXi (冰淇淋 AZXi)", "内置芳碳", ["ice cream azxi", "冰淇淋azxi", "azxi"]),
  blade("xiom", "stradivarius", "Stradivarius (斯特拉迪瓦里)", "外置芳碳", ["stradivarius", "斯特拉迪瓦里", "小提琴骄猛"]),

  // Nittaku 尼塔库
  blade("nittaku", "acoustic", "Acoustic (木吉他)", "纯木", ["acoustic", "木吉他", "吉他"]),
  blade("nittaku", "acoustic-carbon", "Acoustic Carbon (碳吉他)", "外置碳素", ["acoustic carbon", "碳吉他"]),
  blade("nittaku", "acoustic-carbon-inner", "Acoustic Carbon Inner (内置碳吉他)", "内置碳素", ["acoustic carbon inner", "内置碳吉他", "内碳吉他"]),
  blade("nittaku", "violin", "Violin (小提琴)", "纯木", ["violin", "小提琴"]),
  blade("nittaku", "ludeack", "Ludeack (鲁迪克)", "纯木", ["ludeack"]),
  blade("nittaku", "septear", "Septear (赛普蒂尔)", "纯木", ["septear"]),
  blade("nittaku", "hina-hayata-h2", "Hina Hayata H2 (早田希娜 H2)", "内置芳碳", ["hina hayata", "早田希娜", "早田", "h2"]),

  // Yasaka 亚萨卡
  blade("yasaka", "yeo", "Ma Lin Extra Offensive (YEO 马琳)", "纯木", ["yeo", "马琳", "malin", "ma lin eo", "马琳纯木"]),
  blade("yasaka", "ymc", "Ma Lin Carbon (YMC 马琳碳素)", "内置碳素", ["ymc", "马琳碳", "马琳碳素", "ma lin carbon"]),
  blade("yasaka", "sweden-extra", "Sweden Extra (YE)", "纯木", ["ye", "sweden extra", "瑞典之星"]),
  blade("yasaka", "falck-carbon", "Falck Carbon (法尔克碳素)", "内置芳碳", ["falck", "法尔克"]),
  blade("yasaka", "atletico-power", "Atletico Power (竞技者 Power)", "内置芳碳", ["atletico", "竞技者"]),

  // Victas 维克塔斯
  blade("victas", "koki-niwa-wood", "Koki Niwa Wood (丹羽孝希 纯木)", "纯木", ["koki niwa", "丹羽", "丹羽孝希", "niwa wood"]),
  blade("victas", "koki-niwa-carbon", "Koki Niwa Carbon (丹羽孝希 碳素)", "外置芳碳", ["koki niwa carbon", "丹羽碳", "niwa carbon"]),
  blade("victas", "zx-gear-in", "ZX-Gear In (内置 ZX)", "内置超级纤维", ["zx gear in", "zxgear in", "zx-gear inner"]),
  blade("victas", "zx-gear-out", "ZX-Gear Out (外置 ZX)", "外置超级纤维", ["zx gear out", "zxgear out", "zx-gear outer"]),
  blade("victas", "koji-matsushita", "Koji Matsushita (松下浩二)", "纯木", ["matsushita", "松下浩二", "松下", "削球"]),
  blade("victas", "fire-fall-ac", "Fire Fall AC (火焰瀑布 AC)", "内置芳碳", ["fire fall", "firefall", "ffac"]),

  // Yinhe 银河 / Sanwei 三维 / Darker 达克
  blade("yinhe", "pro-01", "专业一号 (Pro-01)", "外置芳碳", ["pro01", "pro 01", "专业1号", "专业一号"]),
  blade("yinhe", "pro-05", "专业五号 (Pro-05)", "内置芳碳", ["pro05", "pro 05", "专业5号", "专业五号"]),
  blade("yinhe", "u-2", "U-2 (银河 U2)", "纯木", ["u2", "u-2"]),
  blade("yinhe", "t-11s", "T-11s (银河 T11s)", "外置碳素", ["t11s", "t11", "t-11"]),
  blade("yinhe", "970xx", "970xx (银河 970)", "内置芳碳", ["970", "970xx", "970 xx"]),
  blade("sanwei", "fextra-7", "Fextra 7 (7层纯木)", "纯木", ["fextra", "fextra7"]),
  blade("darker", "speed-90", "Speed 90 (达克90)", "纯木", ["speed 90", "达克90", "达克 90"]),
];

// ---------------------------------------------------------------------------
// Rubbers
// ---------------------------------------------------------------------------

type RubberSpecs = Pick<RubberEntry, "thicknessOptions" | "hardnessOptions" | "defaultBoosted"> & { category?: RubberCategory };

const rubber = (brand: BrandId, id: string, name: string, aliases: string[], specs: RubberSpecs): RubberEntry => ({
  id: `rubber-${brand}-${id}`,
  brand,
  name,
  aliases,
  category: specs.category ?? "反胶",
  thicknessOptions: specs.thicknessOptions,
  ...(specs.hardnessOptions ? { hardnessOptions: specs.hardnessOptions } : {}),
  ...(specs.defaultBoosted !== undefined ? { defaultBoosted: specs.defaultBoosted } : {}),
});

const DHS_THICKNESS = [2.1, 2.15, 2.2];
const TENERGY_THICKNESS = [1.7, 1.9, 2.1];
const DIGNICS_THICKNESS = [1.9, 2.1];
const JAPANESE_THICKNESS = [1.8, 2.0, 2.1];
const SPECTOL_THICKNESS = [1.3, 1.6, 1.8, 2.0, 2.1];
const CHINESE_HARDNESS = ["38", "39", "40", "41"];

export const RUBBER_CATALOG: readonly RubberEntry[] = [
  // DHS 红双喜
  rubber("dhs", "h3", "狂飚3 普狂 (H3 Commercial)", ["h3", "狂飚3", "普狂", "hurricane 3", "hurricane3", "h3 commercial"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["38", "39", "40", "41"],
    defaultBoosted: true,
  }),
  rubber("dhs", "h3-provincial-blue", "狂飚3 省狂蓝海绵 (H3 Provincial Blue)", ["省狂", "蓝省", "省狂蓝", "h3 provincial", "h3 provincial blue", "provincial blue"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["39", "40", "41"],
    defaultBoosted: true,
  }),
  rubber("dhs", "h3-provincial-orange", "狂飚3 省狂橙海绵 (H3 Provincial Orange)", ["橙省", "省狂橙", "h3 provincial orange", "provincial orange"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["37", "38", "39", "40"],
    defaultBoosted: true,
  }),
  rubber("dhs", "h3-national-blue", "狂飚3 国狂蓝海绵 (H3 National Blue)", ["国狂", "蓝国", "国狂蓝", "h3 national", "h3 national blue", "national blue"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["39", "40", "41", "41.5"],
    defaultBoosted: true,
  }),
  rubber("dhs", "h3-national-orange", "狂飚3 国狂橙海绵 (H3 National Orange)", ["橙国", "国狂橙", "h3 national orange", "national orange"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["37", "38", "39", "40"],
    defaultBoosted: true,
  }),
  rubber("dhs", "h3-neo", "狂飚3 NEO (H3 Neo)", ["h3 neo", "h3neo", "neo h3", "狂飚3neo", "neo"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["37", "38", "39", "40", "41"],
  }),
  rubber("dhs", "h3-50", "狂飚3-50 (H3-50)", ["h3-50", "h350", "3-50", "狂飚3-50"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["35", "37"],
  }),
  rubber("dhs", "h8", "狂飚8 (H8)", ["h8", "狂飚8", "hurricane 8", "hurricane8"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["37", "38", "39", "40"],
  }),
  rubber("dhs", "h8-80", "狂飚8-80 (H8-80)", ["h8-80", "h880", "8-80", "狂飚8-80"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["37", "38", "39"],
  }),
  rubber("dhs", "skyline-2", "天极2 (Skyline 2)", ["天极2", "skyline 2", "skyline2", "tg2"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["39", "40"],
  }),
  rubber("dhs", "skyline-3", "天极3 (Skyline 3)", ["天极3", "skyline 3", "skyline3", "tg3"], {
    thicknessOptions: DHS_THICKNESS,
    hardnessOptions: ["39", "40"],
  }),
  rubber("dhs", "gold-arc-8", "金弓8 (Gold Arc 8)", ["金弓8", "金弓", "gold arc 8", "goldarc8", "ga8"], {
    thicknessOptions: [2.0, 2.1],
    hardnessOptions: ["47.5", "50"],
  }),

  // Butterfly 蝴蝶
  rubber("butterfly", "t05", "Tenergy 05 (T05)", ["t05", "tenergy 05", "tenergy05"], { thicknessOptions: TENERGY_THICKNESS, hardnessOptions: ["36"] }),
  rubber("butterfly", "t05-fx", "Tenergy 05 FX (T05 FX)", ["t05fx", "t05 fx", "tenergy 05 fx"], { thicknessOptions: TENERGY_THICKNESS, hardnessOptions: ["32"] }),
  rubber("butterfly", "t05-hard", "Tenergy 05 Hard (T05 Hard)", ["t05h", "t05 hard", "tenergy 05 hard"], { thicknessOptions: DIGNICS_THICKNESS, hardnessOptions: ["43"] }),
  rubber("butterfly", "t64", "Tenergy 64 (T64)", ["t64", "tenergy 64"], { thicknessOptions: TENERGY_THICKNESS, hardnessOptions: ["36"] }),
  rubber("butterfly", "t80", "Tenergy 80 (T80)", ["t80", "tenergy 80"], { thicknessOptions: TENERGY_THICKNESS, hardnessOptions: ["36"] }),
  rubber("butterfly", "t19", "Tenergy 19 (T19)", ["t19", "tenergy 19"], { thicknessOptions: TENERGY_THICKNESS, hardnessOptions: ["36"] }),
  rubber("butterfly", "d09c", "Dignics 09C (D09c)", ["d09c", "d09", "dignics 09c", "dignics09c"], { thicknessOptions: DIGNICS_THICKNESS, hardnessOptions: ["44"] }),
  rubber("butterfly", "d05", "Dignics 05 (D05)", ["d05", "dignics 05", "dignics05"], { thicknessOptions: DIGNICS_THICKNESS, hardnessOptions: ["40"] }),
  rubber("butterfly", "d80", "Dignics 80 (D80)", ["d80", "dignics 80"], { thicknessOptions: DIGNICS_THICKNESS, hardnessOptions: ["40"] }),
  rubber("butterfly", "d64", "Dignics 64 (D64)", ["d64", "dignics 64"], { thicknessOptions: DIGNICS_THICKNESS, hardnessOptions: ["40"] }),
  rubber("butterfly", "rozena", "Rozena (罗泽娜)", ["rozena", "罗泽娜"], { thicknessOptions: TENERGY_THICKNESS, hardnessOptions: ["35"] }),
  rubber("butterfly", "glayzer", "Glayzer (格雷泽)", ["glayzer", "格雷泽"], { thicknessOptions: DIGNICS_THICKNESS, hardnessOptions: ["38"] }),
  rubber("butterfly", "glayzer-09c", "Glayzer 09C (格雷泽 09C)", ["glayzer 09c", "glayzer09c", "格雷泽09c", "g09c"], {
    thicknessOptions: DIGNICS_THICKNESS,
    hardnessOptions: ["42"],
  }),
  rubber("butterfly", "feint-long-2", "Feint Long II (长胶)", ["feint long 2", "feint long ii", "feint 2"], { category: "长胶", thicknessOptions: [0.5, 1.1, 1.3] }),
  rubber("butterfly", "feint-long-3", "Feint Long III (长胶)", ["feint long 3", "feint long iii", "feint 3"], { category: "长胶", thicknessOptions: [0.5, 1.1, 1.3] }),

  // Tibhar 挺拔
  rubber("tibhar", "k3", "Hybrid K3 (挺拔 K3)", ["k3", "hybrid k3", "挺拔k3"], { thicknessOptions: [2.0, 2.1, 2.2], hardnessOptions: ["53"] }),
  rubber("tibhar", "k3-pro", "Hybrid K3 Pro (挺拔 K3 Pro)", ["k3 pro", "k3pro", "hybrid k3 pro"], { thicknessOptions: [2.0, 2.1, 2.2], hardnessOptions: ["55"] }),
  rubber("tibhar", "mx-p", "Evolution MX-P", ["mxp", "mx-p", "evolution mxp"], { thicknessOptions: [1.9, 2.1, 2.2], hardnessOptions: ["47.5", "50"] }),
  rubber("tibhar", "mx-s", "Evolution MX-S", ["mxs", "mx-s", "evolution mxs"], { thicknessOptions: [1.9, 2.1, 2.2], hardnessOptions: ["47.5"] }),
  rubber("tibhar", "el-p", "Evolution EL-P", ["elp", "el-p", "evolution elp"], { thicknessOptions: [1.9, 2.1, 2.2], hardnessOptions: ["42.5"] }),
  rubber("tibhar", "fx-p", "Evolution FX-P", ["fxp", "fx-p", "evolution fxp"], { thicknessOptions: [1.9, 2.1, 2.2], hardnessOptions: ["40"] }),

  // XIOM 骄猛
  rubber("xiom", "vega-china", "Vega China (唯佳中国)", ["vega china", "唯佳中国", "vega中国"], { thicknessOptions: [2.0, 2.1, 2.2], hardnessOptions: ["54"] }),
  rubber("xiom", "vega-pro", "Vega Pro (银V)", ["vega pro", "银v"], { thicknessOptions: [2.0, 2.1, 2.2], hardnessOptions: ["47.5"] }),
  rubber("xiom", "vega-europe", "Vega Europe (蓝V)", ["vega europe", "蓝v"], { thicknessOptions: [2.0, 2.1, 2.2], hardnessOptions: ["42.5"] }),
  rubber("xiom", "vega-x", "Vega X (红V)", ["vega x", "红v"], { thicknessOptions: [2.0, 2.1, 2.2], hardnessOptions: ["47.5"] }),
  rubber("xiom", "omega-7-pro", "Omega VII Pro (欧米茄7 Pro)", ["omega 7 pro", "omega vii pro", "o7 pro", "欧米茄7pro"], {
    thicknessOptions: [2.0, 2.1, 2.2],
    hardnessOptions: ["47.5"],
  }),
  rubber("xiom", "omega-7-tour", "Omega VII Tour (欧米茄7 Tour)", ["omega 7 tour", "omega vii tour", "o7 tour", "欧米茄7tour"], {
    thicknessOptions: [2.0, 2.1, 2.2],
    hardnessOptions: ["55"],
  }),
  rubber("xiom", "omega-7-asia", "Omega VII Asia (欧米茄7 亚洲版)", ["omega 7 asia", "omega vii asia", "o7 asia", "欧米茄7亚洲"], {
    thicknessOptions: [2.0, 2.1, 2.2],
    hardnessOptions: ["52.5"],
  }),

  // Nittaku 尼塔库
  rubber("nittaku", "fastarc-g1", "Fastarc G-1", ["g1", "g-1", "fastarc g1"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["47.5"] }),
  rubber("nittaku", "fastarc-c1", "Fastarc C-1", ["c1", "c-1", "fastarc c1"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["45"] }),
  rubber("nittaku", "fastarc-p1", "Fastarc P-1", ["p1", "p-1", "fastarc p1"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["47.5"] }),
  rubber("nittaku", "moristo-sp", "Moristo SP (生胶)", ["moristo", "moristo sp"], { category: "生胶", thicknessOptions: JAPANESE_THICKNESS }),

  // Yasaka 亚萨卡
  rubber("yasaka", "rakza-7", "Rakza 7 (R7)", ["r7", "rakza 7", "rakza7"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["47"] }),
  rubber("yasaka", "rakza-7-soft", "Rakza 7 Soft (R7 Soft)", ["r7 soft", "r7s", "rakza 7 soft"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["40"] }),
  rubber("yasaka", "rakza-z", "Rakza Z", ["rakza z", "rakzaz"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["50", "52.5"] }),
  rubber("yasaka", "rakza-x", "Rakza X", ["rakza x", "rakzax"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["47", "50"] }),

  // Victas 维克塔斯
  rubber("victas", "v15-extra", "V>15 Extra", ["v15", "v>15", "v15 extra"], { thicknessOptions: JAPANESE_THICKNESS, hardnessOptions: ["47.5"] }),
  rubber("victas", "v20-double-extra", "V>20 Double Extra", ["v20", "v>20", "v20 double extra"], {
    thicknessOptions: JAPANESE_THICKNESS,
    hardnessOptions: ["52.5"],
  }),
  rubber("victas", "v22-double-extra", "V>22 Double Extra", ["v22", "v>22", "v22 double extra"], {
    thicknessOptions: JAPANESE_THICKNESS,
    hardnessOptions: ["50"],
  }),
  rubber("victas", "spectol-s1", "Spectol S1 (生胶)", ["spectol", "spectol s1", "s1"], { category: "生胶", thicknessOptions: SPECTOL_THICKNESS }),
  rubber("victas", "spectol-s2", "Spectol S2 (生胶)", ["spectol s2", "s2"], { category: "生胶", thicknessOptions: SPECTOL_THICKNESS }),
  rubber("victas", "curl-p1v", "Curl P1V (长胶)", ["curl p1v", "curl", "p1v"], { category: "长胶", thicknessOptions: SPECTOL_THICKNESS }),

  // Donic 多尼克 / Andro 岸度
  rubber("donic", "bluefire-m1", "Bluefire M1 (蓝火 M1)", ["bluefire m1", "蓝火m1", "bf m1"], { thicknessOptions: [1.8, 2.0, 2.1], hardnessOptions: ["47.5"] }),
  rubber("donic", "bluefire-m2", "Bluefire M2 (蓝火 M2)", ["bluefire m2", "蓝火m2", "bf m2"], { thicknessOptions: [1.8, 2.0, 2.1], hardnessOptions: ["42.5"] }),
  rubber("andro", "rasanter-r47", "Rasanter R47", ["r47", "rasanter r47"], { thicknessOptions: [1.7, 1.9, 2.1, 2.3], hardnessOptions: ["47"] }),
  rubber("andro", "rasanter-r50", "Rasanter R50", ["r50", "rasanter r50"], { thicknessOptions: [1.7, 1.9, 2.1, 2.3], hardnessOptions: ["50"] }),

  // 729 / 银河 Yinhe
  rubber("friendship", "bloom-power-2", "奔腾2 (Bloom Power)", ["奔腾2", "奔腾", "bloom power", "bloom"], { thicknessOptions: [2.1, 2.2], hardnessOptions: CHINESE_HARDNESS }),
  rubber("friendship", "focus-3", "焦点3 (Focus 3)", ["焦点3", "焦点", "focus 3", "focus3", "focus iii"], { thicknessOptions: [2.1, 2.2], hardnessOptions: CHINESE_HARDNESS }),
  rubber("friendship", "presto", "闪现 (Presto)", ["闪现", "presto"], { thicknessOptions: [2.1, 2.2], hardnessOptions: CHINESE_HARDNESS }),
  rubber("yinhe", "moon", "月球 (Moon)", ["月球", "银河月球", "moon", "yinhe moon"], { thicknessOptions: [2.1, 2.2], hardnessOptions: CHINESE_HARDNESS }),
  rubber("yinhe", "big-dipper", "北斗 (Big Dipper)", ["北斗", "银河北斗", "big dipper"], { thicknessOptions: [2.1, 2.2], hardnessOptions: CHINESE_HARDNESS }),
  rubber("yinhe", "mercury-2", "水星2 (Mercury 2)", ["水星2", "水星", "mercury 2", "mercury ii"], { thicknessOptions: [2.1, 2.2], hardnessOptions: CHINESE_HARDNESS }),
];

/** Offered as chips when the rubber name does not match the catalog. */
export const DEFAULT_THICKNESS_OPTIONS: readonly number[] = [1.8, 2.0, 2.1, 2.15, 2.2];
export const DEFAULT_HARDNESS_OPTIONS: readonly string[] = ["38", "39", "40", "41", "42.5", "47.5", "50"];

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search form of a text: half-width, lower case, `飙` folded into `飚`, without spaces and
 * punctuation (so `H3-50`, `h3 50` and `H350` are equal).
 */
export function normalizeSearchText(value: string) {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .toLowerCase()
    .replace(/飙/g, "飚")
    .replace(/[\s\-_.·・,，、/\\()（）[\]<>'"+°]/g, "");
}

/** Value written into the name field when an entry is picked. */
export function catalogValue(entry: CatalogEntry) {
  const { label } = BRAND_BY_ID[entry.brand];
  return entry.name.startsWith(label) ? entry.name : `${label} ${entry.name}`;
}

/** `Viscaria (维斯卡利亚)` -> [`Viscaria`, `维斯卡利亚`]. */
function nameParts(name: string) {
  const match = /^(.*?)\s*[(（](.*)[)）]\s*$/.exec(name);
  return match ? [match[1], match[2]] : [];
}

type IndexedEntry<T extends CatalogEntry> = {
  entry: T;
  /** Normalized names and aliases: exact / prefix matching and rubber name matching. */
  keys: string[];
  /** Everything searchable (keys + brand names + category), joined. */
  haystack: string;
};

function buildIndex<T extends CatalogEntry>(entries: readonly T[]): IndexedEntry<T>[] {
  return entries.map((entry) => {
    const brand = BRAND_BY_ID[entry.brand];
    const keys = [...new Set([entry.name, catalogValue(entry), ...nameParts(entry.name), ...entry.aliases].map(normalizeSearchText))].filter(
      Boolean,
    );
    const extra = [brand.name, brand.en, ...(brand.aliases ?? []), entry.category ?? ""].map(normalizeSearchText);
    return { entry, keys, haystack: [...keys, ...extra].filter(Boolean).join("|") };
  });
}

const BLADE_INDEX = buildIndex(BLADE_CATALOG);
const RUBBER_INDEX = buildIndex(RUBBER_CATALOG);

export type CatalogKind = "blade" | "rubber";

export type CatalogEntryOf<K extends CatalogKind> = K extends "blade" ? BladeEntry : RubberEntry;

export type CatalogGroup<T extends CatalogEntry> = { brand: CatalogBrand; entries: T[] };

function indexOf<K extends CatalogKind>(kind: K) {
  return (kind === "blade" ? BLADE_INDEX : RUBBER_INDEX) as IndexedEntry<CatalogEntryOf<K>>[];
}

/** Brands that have entries in a catalog, in pill order. */
export function catalogBrands(kind: CatalogKind): CatalogBrand[] {
  const used = new Set(indexOf(kind).map((item) => item.entry.brand));
  return CATALOG_BRANDS.filter((brand) => used.has(brand.id));
}

/**
 * Entries matching every word of `query` (in names, aliases, brand or construction), grouped by
 * brand. Exact and prefix matches of a name / alias rank first; brands follow their best match.
 */
export function searchCatalog<K extends CatalogKind>(kind: K, query: string, brandId?: BrandId): CatalogGroup<CatalogEntryOf<K>>[] {
  const tokens = query.split(/\s+/).map(normalizeSearchText).filter(Boolean);
  const whole = normalizeSearchText(query);
  const matches: { entry: CatalogEntryOf<K>; score: number; order: number }[] = [];

  indexOf(kind).forEach((item, order) => {
    if (brandId && item.entry.brand !== brandId) return;
    if (!tokens.every((token) => item.haystack.includes(token))) return;
    const score = !whole || item.keys.includes(whole) ? 0 : item.keys.some((key) => key.startsWith(whole)) ? 1 : 2;
    matches.push({ entry: item.entry, score, order });
  });
  matches.sort((left, right) => left.score - right.score || left.order - right.order);

  const groups = new Map<BrandId, CatalogEntryOf<K>[]>();
  for (const { entry } of matches) {
    const group = groups.get(entry.brand);
    if (group) group.push(entry);
    else groups.set(entry.brand, [entry]);
  }
  return [...groups].map(([id, entries]) => ({ brand: BRAND_BY_ID[id], entries }));
}

/**
 * Catalog rubber that a free-text name refers to (`H3 Provincial Blue 41 2.2` -> 省狂蓝海绵,
 * `T05 2.1` -> Tenergy 05): the entry with the longest name / alias contained in the text.
 */
export function matchRubberCatalog(name: string): RubberEntry | undefined {
  const text = normalizeSearchText(name);
  if (!text) return undefined;
  let best: { entry: RubberEntry; length: number } | undefined;
  for (const item of RUBBER_INDEX) {
    for (const key of item.keys) {
      if (key.length < 2 || key.length <= (best?.length ?? 0) || !text.includes(key)) continue;
      best = { entry: item.entry, length: key.length };
    }
  }
  return best?.entry;
}

/** Number with up to two decimals and no trailing zeros (`2.15`, `2`). */
export function formatSpecNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

/** Sponge thickness with at least one decimal, as printed on the packaging (`2.0`, `2.15`). */
export function formatThickness(mm: number) {
  const text = formatSpecNumber(mm);
  return text.includes(".") ? text : `${text}.0`;
}

/** Short spec line for a picker option, e.g. `2.1/2.15/2.2 mm · 39/40/41°` or `外置芳碳`. */
export function describeCatalogEntry(entry: CatalogEntry) {
  if (!("thicknessOptions" in entry)) return entry.category ?? "";
  const thickness = entry.thicknessOptions;
  const thicknessText =
    thickness.length > 3
      ? `${formatThickness(thickness[0])}–${formatThickness(thickness[thickness.length - 1])} mm`
      : `${thickness.map(formatThickness).join("/")} mm`;
  const parts = [entry.category === "反胶" ? null : entry.category, thicknessText, entry.hardnessOptions ? `${entry.hardnessOptions.join("/")}°` : null];
  return parts.filter(Boolean).join(" · ");
}
