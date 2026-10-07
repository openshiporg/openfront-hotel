import { keystoneContext } from '../../features/keystone/context'
import { createYoga } from "graphql-yoga";
// @ts-ignore
import processRequest from "graphql-upload/processRequest.js";
import { type NextApiRequest, type NextApiResponse } from 'next'
import { enforceAbuseLimit } from '../../features/keystone/lib/abuseControl';
import { hotelGraphqlPolicyRequest, hotelGraphqlRequestPolicy } from '../../features/keystone/lib/hotelGraphqlRequestPolicy';
import { GraphqlRequestBodyTooLargeError, MAX_GRAPHQL_REQUEST_BODY_BYTES, readBoundedGraphqlRequestBody } from '../../features/keystone/lib/graphqlRequestBody';
import { hotelGraphqlQueryLimitsPlugin } from '../../features/keystone/lib/hotelGraphqlQueryLimits';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const contentType = String(req.headers['content-type'] || '');
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_GRAPHQL_REQUEST_BODY_BYTES) {
    return res.status(413).json({ errors: [{ message: 'Request is too large' }] });
  }
  if (contentType.startsWith('multipart/form-data')) {
    try {
      req.body = await processRequest(req, res, {
        maxFieldSize: 1_000_000,
        maxFileSize: 10 * 1024 * 1024,
        maxFiles: 2,
      });
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error && error.status === 413 ? 413 : 400;
      const message = status === 413 ? 'Request is too large' : 'Invalid GraphQL multipart request';
      return res.status(status).json({ errors: [{ message }] });
    }
  } else if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const rawBody = await readBoundedGraphqlRequestBody(req);
      req.body = JSON.parse(rawBody.toString('utf8'));
    } catch (error) {
      if (error instanceof GraphqlRequestBodyTooLargeError) {
        return res.status(413).json({ errors: [{ message: 'Request is too large' }] });
      }
      return res.status(400).json({ errors: [{ message: 'Invalid GraphQL request body' }] });
    }
  }

  const requestContext = await keystoneContext.withRequest(req, res);
  if (req.method === 'POST' || req.method === 'GET') {
    const policyRequest = hotelGraphqlPolicyRequest(req.method, req.body, req.query);
    const policy = hotelGraphqlRequestPolicy(policyRequest);
    try {
      for (const limit of policy.abuseLimits) await enforceAbuseLimit(requestContext, limit);
    } catch {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ errors: [{ message: 'Too many requests. Please wait and try again.' }] });
    }
    if (policy.blockedBuiltInPasswordReset) {
      return res.status(400).json({ errors: [{ message: 'This password reset operation is unavailable.' }] });
    }
  }

  return createYoga({
    renderGraphiQL: () => {
      return `
        <!DOCTYPE html>
        <html lang="en">
          <body style="margin: 0; overflow-x: hidden; overflow-y: hidden">
          <div id="sandbox" style="height:100vh; width:100vw;"></div>
          <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
          <script>
          new window.EmbeddedSandbox({
            target: "#sandbox",
            // Pass through your server href if you are embedding on an endpoint.
            // Otherwise, you can pass whatever endpoint you want Sandbox to start up with here.
            initialEndpoint: window.location.href,
            hideCookieToggle: false,
            initialState: {
              includeCookies: true
            }
          });
          // advanced options: https://www.apollographql.com/docs/studio/explorer/sandbox#embedding-sandbox
          </script>
          </body>
        </html>`;
    },
    graphqlEndpoint: "/api/graphql",
    schema: keystoneContext.graphql.schema,
    context: () => requestContext,
    plugins: [hotelGraphqlQueryLimitsPlugin],
    multipart: false,
  })(req, res);
}