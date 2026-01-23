'use server';

import type React from 'react';

import { SES, type SendEmailCommandInput } from '@aws-sdk/client-ses';
import { render } from '@react-email/components';

import { env } from '@/lib/env';

import { config } from './aws-config';

export const sendSESEmail = async (
  to: string[],
  subject: string,
  emailBody: React.ReactElement,
) => {
  const ses = new SES(config);
  const emailHtml = await render(emailBody);
  const emailText = await render(emailBody, {
    plainText: true,
  });

  const params: SendEmailCommandInput = {
    Source: env.EMAIL_SENDER_ADDRESS,
    Destination: {
      ToAddresses: to,
    },
    Message: {
      Body: {
        Text: {
          Data: emailText,
        },
        Html: {
          Data: emailHtml,
        },
      },
      Subject: {
        Data: subject,
      },
    },
  };

  await ses.sendEmail(params);
};
