import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/core/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Vera Bot worker", () => {
	it("responds with Vera greeting (unit style)", async () => {
		const request = new IncomingRequest("http://example.com");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"vera! 這裡是薇拉的酒館，請不要亂闖喔～"`);
	});

	it("responds with Vera greeting (integration style)", async () => {
		const response = await SELF.fetch("https://example.com");
		expect(await response.text()).toMatchInlineSnapshot(`"vera! 這裡是薇拉的酒館，請不要亂闖喔～"`);
	});
});
