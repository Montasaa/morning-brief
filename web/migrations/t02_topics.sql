-- t02: the Catalog's Topics, seeded with the 14 starting Topics (today's nine
-- v2 sections, split up). The legacy importer tags Items with these ids.
-- Later tickets add columns (creator, sharing, Gathering Rules, follows) with
-- their own migrations; item_topics keeps no foreign key to this table.

CREATE TABLE topics (
  id         TEXT PRIMARY KEY,                    -- slug, as Editions use it in items[].topics
  name       TEXT NOT NULL,
  name_ar    TEXT NOT NULL,
  sensitive  INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0, 1)),  -- opt-in only (Graphic, Adult Trending)
  position   INTEGER NOT NULL,                    -- Catalog order
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO topics (id, name, name_ar, sensitive, position) VALUES
  ('saudi',                  'Saudi',                    'السعودية',                         0,  1),
  ('yemen',                  'Yemen',                    'اليمن',                            0,  2),
  ('iran',                   'Iran',                     'إيران',                            0,  3),
  ('wider-middle-east',      'Wider Middle East',        'الشرق الأوسط',                     0,  4),
  ('us-markets',             'US Markets',               'الأسواق الأمريكية',                0,  5),
  ('ai',                     'AI',                       'الذكاء الاصطناعي',                 0,  6),
  ('github-trending',        'GitHub Trending',          'الرائج على GitHub',                0,  7),
  ('liverpool',              'Liverpool',                'ليفربول',                          0,  8),
  ('strategy-games',         'Strategy Games',           'ألعاب الاستراتيجية',               0,  9),
  ('turn-based-rpg-tactics', 'Turn-based RPG & Tactics', 'ألعاب تقمص الأدوار والتكتيك بالأدوار', 0, 10),
  ('trending-games',         'Trending Games',           'الألعاب الرائجة',                  0, 11),
  ('social-trends',          'Social Trends',            'الرائج على مواقع التواصل',         0, 12),
  ('graphic',                'Graphic',                  'مشاهد قاسية',                      1, 13),
  ('adult-trending',         'Adult Trending',           'رائج للبالغين',                    1, 14);
