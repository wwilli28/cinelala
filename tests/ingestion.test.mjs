import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./load-source.mjs";

const academyProgram = {
  sys: { id: "screening-1" },
  slug: "test-screening",
  activeStartDate: "2099-11-20T00:00:00.000Z",
  programTitle: { html: "<p>Test Film</p>" },
  programTypesCollection: { items: [{ sys: { id: "16i3uOYQwism7sMDhIQr2O" } }] },
  ticketureIdProduction: "ticket-1",
};
const calendarProps = { cfProgramsKeyedByTkId: { "ticket-1": academyProgram } };

function mockAcademy(t, html) {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("cached_api")) {
      return Response.json({ event_session: { _data: [{
        event_template_id: "ticket-1", start_datetime: "2099-11-21T03:30:00Z", sold_out: true,
      }] } });
    }
    return new Response(html);
  });
}

for (const format of ["legacy", "streamed"]) {
  test(`Academy reads ${format} calendar and attaches ticketing sessions`, async (t) => {
    let html;
    if (format === "legacy") {
      html = `<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: calendarProps } })}</script>`;
    } else {
      const row = `5:${JSON.stringify(["$", "$L20", null, calendarProps])}\n`;
      const middle = Math.floor(row.length / 2);
      html = `<script>throw new Error('remote code must never run')</script>` +
        [row.slice(0, middle), row.slice(middle)].map((part) =>
          `<script>self.__next_f.push([1,${JSON.stringify(part)}])</script>`).join("");
    }
    mockAcademy(t, html);
    const { getAcademyPrograms } = loadSource("lib/theaters/academy.ts");
    const result = await getAcademyPrograms();
    assert.equal(result.status.available, true, result.status.message);
    assert.equal(result.programs.length, 1);
    assert.equal(result.programs[0].films[0].title, "Test Film");
    assert.equal(result.programs[0].showtimes[0].time, "19:30");
    assert.equal(result.programs[0].showtimes[0].soldOut, true);
  });
}

test("Academy reports missing calendar payload as unavailable", async (t) => {
  mockAcademy(t, "<html>Site changed again</html>");
  const result = await loadSource("lib/theaters/academy.ts").getAcademyPrograms();
  assert.equal(result.status.available, false);
  assert.match(result.status.message, /calendar program data/);
});

function mockLandmark(t, { missingMovies = false, date = "2099-11-20" } = {}) {
  const root = "https://cms-assets.webediamovies.pro/prod/landmarktheatres/new-deployment/public/";
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    if (String(url).includes("www.landmarktheatres.com")) {
      return new Response(`<script src="${root}app-newhash.js" async></script>`);
    }
    if (String(url).endsWith("/page-data.json")) {
      return Response.json({ staticQueryHashes: ["111", "222", "333", "444"] });
    }
    if (String(url).endsWith("/111.json")) return Response.json({ data: { allEvent: { nodes: [] } } });
    if (String(url).endsWith("/222.json")) return Response.json({ data: { allEvent: { nodes: [{
      id: "series", type: "Film Series", title: "Cine Insomnia", theaters: [{ id: "X00CW" }],
      relatedMovies: [{ movie: { id: "movie-1" }, showtimes: [[date, null]] }],
    }] } } });
    if (String(url).endsWith("/333.json") && !missingMovies) {
      return Response.json({ data: { allMovie: { nodes: [{ id: "movie-1", title: "Current Film" }] } } });
    }
    return new Response("Unavailable unrelated query", { status: 404 });
  });
  return calls;
}

test("Nuart discovers changed deployment and query hashes, preserving date-only times as unknown", async (t) => {
  const calls = mockLandmark(t);
  const result = await loadSource("lib/theaters/nuart.ts").getNuartPrograms();
  assert.equal(result.status.available, true, result.status.message);
  assert.equal(result.programs.length, 1);
  assert.equal(result.programs[0].date, "2099-11-20");
  assert.equal(result.programs[0].films[0].title, "Current Film");
  assert.equal(result.programs[0].startTime, null);
  assert.deepEqual(result.programs[0].showtimes, []);
  assert.ok(calls.some((url) => url.endsWith("/333.json")));
  assert.ok(!calls.some((url) => url.includes("2026-04-07")));
});

test("Nuart keeps explicit source screening times", async (t) => {
  mockLandmark(t, { date: "2099-11-20 21:45:00" });
  const result = await loadSource("lib/theaters/nuart.ts").getNuartPrograms();
  assert.equal(result.programs[0].startTime, "21:45");
});

test("Nuart reports missing movie data and expired data as unavailable", async (t) => {
  mockLandmark(t, { missingMovies: true });
  assert.equal((await loadSource("lib/theaters/nuart.ts").getNuartPrograms()).status.available, false);
  t.mock.restoreAll();
  mockLandmark(t, { date: "2000-01-01" });
  const result = await loadSource("lib/theaters/nuart.ts").getNuartPrograms();
  assert.equal(result.status.available, false);
  assert.match(result.status.message, /expired screenings/);
});

test("detail-page collection retains successes and reports complete failure", async () => {
  const { collectPageResults } = loadSource("lib/ingestion/pages.ts");
  assert.deepEqual(await collectPageResults([Promise.resolve("ok"), Promise.reject(new Error("timeout"))]), {
    values: ["ok"], failedCount: 1,
  });
  await assert.rejects(collectPageResults([Promise.reject(new Error("timeout"))]), /All 1 screening pages/);
});

for (const theater of ["new-beverly", "vista"]) {
  test(`${theater} keeps other listings when a detail request fails`, async (t) => {
    const isVista = theater === "vista";
    const base = isVista ? "https://www.vistatheaterhollywood.com/movies/" : "https://thenewbev.com/program/";
    const schedule = ["ok", "failed"].map((slug) => isVista
      ? `<a href="${base}${slug}/">Film</a>`
      : `<article class="event-card"><a href="${base}${slug}/">Film</a></article>`).join("");
    const detail = isVista
      ? `<h1 class="entry__movie--title">Test Film</h1>
        <div class="entry__movie--showtimes"><div>
        <div class="entry__movie--dates"><p class='text__size-4'>November 20, 2099</p>
        <div class="entry__movie--times"><a href="https://tickets.example/" class="time">7:30 pm</a></div>
        </div></div><div class="entry__movie--columns">`
      : `<time class="movie-mast__dates">November 20, 2099</time>
        <section class="movies"><div class="movie row-xl"><h2 class="movie__title">Test Film</h2></div></section>`;
    t.mock.method(globalThis, "fetch", async (url) => {
      if (String(url).includes("failed/")) throw new Error("detail request timed out");
      return new Response(String(url).includes("schedule/") ? schedule : detail);
    });
    const adapter = loadSource(`lib/theaters/${theater}.ts`);
    const result = await (isVista ? adapter.getVistaPrograms() : adapter.getNewBeverlyPrograms());
    assert.equal(result.status.available, true, result.status.message);
    assert.equal(result.programs.length, 1);
    assert.equal(result.programs[0].films[0].title, "Test Film");
    assert.match(result.status.message, /Some .* screenings could not be loaded/);
  });
}
