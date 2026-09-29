import {
  Body,
  Button,
  Container,
  Head,
  Html,
  pixelBasedPreset,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

interface FriendInvitationEmailProps {
  inviterName: string;
  inviterEmail: string;
  acceptLink: string;
}

const FriendInvitationEmail = ({
  inviterName,
  inviterEmail,
  acceptLink,
}: FriendInvitationEmailProps) => {
  return (
    <Html>
      <Head />
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
        }}
      >
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Preview>{inviterName} wants to share expenses with you</Preview>
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]">
            <Section>
              <Text>Hi,</Text>
              <Text>
                {inviterName} ({inviterEmail}) records the money you share on Expense Tracker and
                wants to connect your accounts.
              </Text>
              <Text>
                Once you accept, the bills they split with you show up in your account as expenses
                they paid, and money they send or receive from you waits for you to say which
                account it touched. Nothing is shared until you accept.
              </Text>
              <Button
                className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
                href={acceptLink}
              >
                Review invitation
              </Button>
              <Text>
                If you don&apos;t know {inviterName}, ignore this email and nothing will happen.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default FriendInvitationEmail;
