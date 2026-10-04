'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { z } from 'zod';

import DeleteConfirmationDialog from '@/components/delete-confirmation-dialog';
import { type FormField } from '@/components/dynamic-form/dynamic-form-fields';
import MutationModal from '@/components/mutation-modal';
import { Button } from '@/components/ui/button';
import { useZonedFormat } from '@/hooks/use-zoned-format';
import { DATE_FORMAT } from '@/lib/format';
import { api } from '@/server/react';
import type { ReportBoundary as Boundary } from '@/types';

const createBoundarySchema = z.object({
  boundaryDate: z.date(),
});

type BoundaryFormValues = z.infer<typeof createBoundarySchema>;

const fields: FormField<BoundaryFormValues>[] = [
  {
    name: 'boundaryDate',
    label: 'Boundary Date',
    type: 'date',
    placeholder: 'Select a date',
  },
];

export const CreateBoundaryForm = ({ refresh }: { refresh?: () => void }) => {
  const mutation = api.reports.createBoundary.useMutation();
  return (
    <MutationModal
      button={
        <Button size="sm" variant="outline">
          Add Date Boundary
        </Button>
      }
      defaultValues={{
        boundaryDate: new Date(),
      }}
      fields={fields}
      mutation={mutation}
      refresh={refresh}
      schema={createBoundarySchema}
      successToast={() => 'Boundary created successfully'}
      titleText="Add Date Boundary"
    />
  );
};

const UpdateBoundaryForm = ({
  refresh,
  boundaryId,
  initialDate,
}: {
  refresh?: () => void;
  boundaryId: string;
  initialDate: Date;
}) => {
  const mutation = api.reports.updateBoundary.useMutation();
  return (
    <MutationModal
      button={
        <Button className="size-8" size="icon" variant="ghost">
          <Pencil className="size-4" />
        </Button>
      }
      defaultValues={{
        boundaryDate: initialDate,
      }}
      fields={fields}
      mapInput={(values) => ({
        id: boundaryId,
        boundaryDate: values.boundaryDate,
      })}
      mutation={mutation}
      refresh={refresh}
      schema={createBoundarySchema}
      successToast={() => 'Boundary updated successfully'}
      titleText="Update Date Boundary"
    />
  );
};

const DeleteBoundaryButton = ({
  refresh,
  boundaryId,
}: {
  refresh?: () => void;
  boundaryId: string;
}) => {
  const mutation = api.reports.deleteBoundary.useMutation();
  return (
    <DeleteConfirmationDialog
      mutation={mutation}
      mutationInput={{ id: boundaryId }}
      refresh={refresh}
      successToast={() => 'Boundary deleted successfully'}
    >
      <Button className="size-8" size="icon" variant="ghost">
        <Trash2 className="size-4" />
      </Button>
    </DeleteConfirmationDialog>
  );
};

export const BoundaryListItem = ({
  boundary,
  refresh,
}: {
  boundary: Boundary;
  refresh?: () => void;
}) => {
  const zoned = useZonedFormat();
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <span className="font-medium">{zoned(boundary.boundaryDate, DATE_FORMAT.date)}</span>
      <div className="flex items-center gap-1">
        <UpdateBoundaryForm
          boundaryId={boundary.id}
          initialDate={boundary.boundaryDate}
          refresh={refresh}
        />
        <DeleteBoundaryButton boundaryId={boundary.id} refresh={refresh} />
      </div>
    </div>
  );
};
