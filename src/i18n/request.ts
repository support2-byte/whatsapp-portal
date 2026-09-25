import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const locale = process.env.NEXT_PUBLIC_APP_LOCALE || 'en';

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    messages = (await import(`../../messages/en.json`)).default;
  }

  return {
    locale,
    messages,
  };
});
