// The real Reddit adapter (issue #19), checked against a stand-in fetch (no
// network) serving a subreddit Atom feed shaped like Reddit's.
import { describe, expect, it } from "vitest";
import { realOutsideServices } from "@/server/outside";
import { parseRedditAtom, REDDIT_USER_AGENT, redditFeedService } from "@/server/outside/reddit";

const FEED = "https://www.reddit.com/r/examplesub/new/.rss";

/** A feed like https://www.reddit.com/r/<sub>/new/.rss: a link post with a picture, a self-post, and a broken entry. */
const ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><category term="examplesub" label="r/examplesub"/><updated>2026-11-14T05:00:00+00:00</updated><id>/r/examplesub/new/.rss</id><title>newest submissions : examplesub</title>
<entry><author><name>/u/first_poster</name><uri>https://www.reddit.com/user/first_poster</uri></author><category term="examplesub" label="r/examplesub"/><content type="html">&lt;table&gt; &lt;tr&gt;&lt;td&gt; &lt;a href=&quot;https://www.reddit.com/r/examplesub/comments/1abc2de/a_picture_post/&quot;&gt; &lt;img src=&quot;https://preview.redd.it/x1.jpeg?width=640&amp;amp;crop=smart&quot; alt=&quot;A picture post&quot; /&gt; &lt;/a&gt; &lt;/td&gt;&lt;td&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;https://www.reddit.com/user/first_poster&quot;&gt; /u/first_poster &lt;/a&gt; &lt;br/&gt; &lt;span&gt;&lt;a href=&quot;https://i.redd.it/x1.jpeg&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt; &amp;#32; &lt;span&gt;&lt;a href=&quot;https://www.reddit.com/r/examplesub/comments/1abc2de/a_picture_post/&quot;&gt;[comments]&lt;/a&gt;&lt;/span&gt; &lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content><id>t3_1abc2de</id><media:thumbnail url="https://preview.redd.it/x1.jpeg?width=640&amp;crop=smart" /><link href="https://www.reddit.com/r/examplesub/comments/1abc2de/a_picture_post/" /><updated>2026-11-14T04:50:00+00:00</updated><published>2026-11-14T04:45:00+00:00</published><title>A picture post &amp; more</title></entry>
<entry><author><name>/u/second_poster</name></author><category term="examplesub" label="r/examplesub"/><content type="html">&lt;!-- SC_OFF --&gt;&lt;div class=&quot;md&quot;&gt;&lt;p&gt;Some words &amp;amp; a thought.&lt;/p&gt; &lt;p&gt;Second line.&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt; &amp;#32; submitted by &amp;#32; &lt;a href=&quot;https://www.reddit.com/user/second_poster&quot;&gt; /u/second_poster &lt;/a&gt; &lt;br/&gt; &lt;span&gt;&lt;a href=&quot;https://www.reddit.com/r/examplesub/comments/1abc2df/words_only/&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;</content><id>t3_1ABC2DF</id><link href="https://www.reddit.com/r/examplesub/comments/1abc2df/words_only/" /><updated>2026-11-14T04:40:00+00:00</updated><published>2026-11-14T04:40:00+00:00</published><title>Words only</title></entry>
<entry><id>t3_broken</id><title>No link or date</title></entry>
</feed>`;

describe("Reddit feed adapter", () => {
  it("reads a subreddit's Atom feed into posts", () => {
    expect(parseRedditAtom(ATOM)).toEqual([
      {
        id: "1abc2de",
        subreddit: "examplesub",
        title: "A picture post & more",
        url: "https://www.reddit.com/r/examplesub/comments/1abc2de/a_picture_post/",
        author: "first_poster",
        published: "2026-11-14T04:45:00.000Z",
        text: "",
        image: "https://preview.redd.it/x1.jpeg?width=640&crop=smart",
        media: true,
      },
      {
        id: "1abc2df",
        subreddit: "examplesub",
        title: "Words only",
        url: "https://www.reddit.com/r/examplesub/comments/1abc2df/words_only/",
        author: "second_poster",
        published: "2026-11-14T04:40:00.000Z",
        text: "Some words & a thought. Second line.",
        image: null,
        media: false,
      },
    ]);
  });

  it("asks with a descriptive User-Agent and returns the posts", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } });
    }) as typeof globalThis.fetch;

    const posts = await redditFeedService({ fetch, minGapMs: 0 }).feed(FEED);

    expect(posts.map((p) => p.id)).toEqual(["1abc2de", "1abc2df"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(FEED);
    expect(new Headers(calls[0]!.init.headers).get("user-agent")).toBe(REDDIT_USER_AGENT);
    expect(REDDIT_USER_AGENT).toMatch(/^morning-brief\//);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws when Reddit refuses (429 and the like), so the run counts the feed as failed", async () => {
    const fetch = (async () => new Response("Too Many Requests", { status: 429 })) as typeof globalThis.fetch;
    await expect(redditFeedService({ fetch, minGapMs: 0 }).feed(FEED)).rejects.toThrow(/429/);
  });

  it("is connected without a key", () => {
    expect(typeof realOutsideServices({}).reddit.feed).toBe("function");
  });
});
