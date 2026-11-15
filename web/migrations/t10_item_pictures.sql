-- t10 (rework ticket 10, GitHub issue #10, spec #6): graded pictures and NSFW
-- media on Items, from the Edition v3 contract's optional `image_kind` and
-- `nsfw_media`. (Its `claim_subject` is for the gathering tool and is not kept.)
--
-- image_kind: photo | card | none, or NULL when the Edition did not say; the app
-- reads NULL as photo when the Item has an image, else none.
-- nsfw_media: 1 when the Item's media is explicit (Adult Trending): it stays
-- blurred until tapped, whatever the Reader's blur switch says.
ALTER TABLE items ADD COLUMN image_kind TEXT CHECK (image_kind IN ('photo', 'card', 'none'));
ALTER TABLE items ADD COLUMN nsfw_media INTEGER NOT NULL DEFAULT 0 CHECK (nsfw_media IN (0, 1));
