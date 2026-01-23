import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  pixelBasedPreset,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

interface ResetPasswordEmailProps {
  userFirstname?: string;
  resetPasswordLink?: string;
}

const ResetPasswordEmail = ({ userFirstname, resetPasswordLink }: ResetPasswordEmailProps) => {
  return (
    <Html>
      <Head />
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
        }}
      >
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Preview>Dropbox reset your password</Preview>
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]">
            <Section>
              <Text>Hi {userFirstname},</Text>
              <Text>
                Someone recently requested a password change for your Expense Tracker account. If
                this was you, you can set a new password here:
              </Text>
              <Button
                className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
                href={resetPasswordLink}
              >
                Reset Password
              </Button>
              <Text>
                If you don&apos;t want to change your password or didn&apos;t request this, just
                ignore and delete this message.
              </Text>
              <Text>
                To keep your account secure, please don&apos;t forward this email to anyone. See our
                Help Center for <Link href={resetPasswordLink}>more security tips.</Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ResetPasswordEmail;
