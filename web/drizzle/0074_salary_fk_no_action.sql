ALTER TABLE "salary_bonuses" DROP CONSTRAINT "salary_bonuses_component_id_salary_components_id_fk";
--> statement-breakpoint
ALTER TABLE "salary_payments" DROP CONSTRAINT "salary_payments_revision_id_salary_revisions_id_fk";
--> statement-breakpoint
ALTER TABLE "salary_revision_components" DROP CONSTRAINT "salary_revision_components_component_id_salary_components_id_fk";
--> statement-breakpoint
ALTER TABLE "salary_bonuses" ADD CONSTRAINT "salary_bonuses_component_id_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."salary_components"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_revision_id_salary_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."salary_revisions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "salary_revision_components" ADD CONSTRAINT "salary_revision_components_component_id_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."salary_components"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;