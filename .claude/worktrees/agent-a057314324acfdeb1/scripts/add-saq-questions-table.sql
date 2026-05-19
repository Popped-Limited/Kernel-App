-- SAQ Questions table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS saq_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_number text NOT NULL,
  section_title  text NOT NULL,
  question_id    text NOT NULL UNIQUE,
  question_text  text NOT NULL,
  answer_type    text NOT NULL DEFAULT 'yesnona', -- yesnona | text | textarea | date
  placeholder    text,
  required       boolean DEFAULT false,
  for_types      text[],   -- NULL = all supplier types; e.g. ARRAY['raw_material']
  sort_order     integer NOT NULL DEFAULT 0,
  active         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE saq_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saq_questions_select" ON saq_questions FOR SELECT USING (true);
CREATE POLICY "saq_questions_insert" ON saq_questions FOR INSERT WITH CHECK (true);
CREATE POLICY "saq_questions_update" ON saq_questions FOR UPDATE USING (true);
CREATE POLICY "saq_questions_delete" ON saq_questions FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON saq_questions TO anon, authenticated;

-- ── Seed: all questions from the SALSA SAQ ────────────────────────────────
INSERT INTO saq_questions (section_number, section_title, question_id, question_text, answer_type, placeholder, required, for_types, sort_order) VALUES

-- Section 1: Company Details
('1','Company Details','1_company_name','Company / trading name','text',null,true,null,1010),
('1','Company Details','1_address','Full address (including postcode)','textarea',null,true,null,1020),
('1','Company Details','1_contact_name','Main contact name','text',null,true,null,1030),
('1','Company Details','1_contact_position','Job title / position','text',null,true,null,1040),
('1','Company Details','1_tel','Telephone number','text',null,true,null,1050),
('1','Company Details','1_email','Email address','text',null,true,null,1060),
('1','Company Details','1_products','Products / services you supply to us','text',null,true,null,1070),

-- Section 2: Food Safety Certification
('2','Food Safety Certification','2_cert_held','Do you hold a recognised food safety certification? (e.g. BRCGS, IFS, FSSC 22000, SQF, SALSA, ISO 22000)','yesnona',null,false,null,2010),
('2','Food Safety Certification','2_cert_name','Name of certification(s) held','text','e.g. BRCGS Food Issue 9 – Grade A',false,null,2020),
('2','Food Safety Certification','2_cert_number','Certificate number','text',null,false,null,2030),
('2','Food Safety Certification','2_cert_expiry','Certificate expiry date','date',null,false,null,2040),
('2','Food Safety Certification','2_cert_body','Certifying body','text','e.g. NSF, Intertek, SGS',false,null,2050),
('2','Food Safety Certification','2_unannounced','Are your audits unannounced?','yesnona',null,false,null,2060),

-- Section 3: Quality Management System
('3','Quality Management System','3_qms','Do you have a documented Quality Management System (QMS)?','yesnona',null,false,null,3010),
('3','Quality Management System','3_qms_review','Is your QMS reviewed and updated at least annually?','yesnona',null,false,null,3020),
('3','Quality Management System','3_food_safety_policy','Do you have a documented food safety policy signed by senior management?','yesnona',null,false,null,3030),
('3','Quality Management System','3_internal_audit','Do you conduct internal audits of your food safety systems?','yesnona',null,false,null,3040),
('3','Quality Management System','3_supplier_approval','Do you have a documented supplier approval and monitoring procedure?','yesnona',null,false,null,3050),
('3','Quality Management System','3_complaints','Do you have a documented customer complaints procedure?','yesnona',null,false,null,3060),
('3','Quality Management System','3_recall','Do you have a documented product recall / withdrawal procedure?','yesnona',null,false,null,3070),

-- Section 4: HACCP & Food Safety Management
('4','HACCP & Food Safety Management','4_haccp','Do you have a documented HACCP plan in place?','yesnona',null,false,null,4010),
('4','HACCP & Food Safety Management','4_haccp_review','Is your HACCP plan reviewed at least annually or after any significant change?','yesnona',null,false,null,4020),
('4','HACCP & Food Safety Management','4_ccp_monitored','Are all Critical Control Points (CCPs) monitored and records maintained?','yesnona',null,false,null,4030),
('4','HACCP & Food Safety Management','4_corrective_actions','Are corrective actions documented and followed up?','yesnona',null,false,null,4040),
('4','HACCP & Food Safety Management','4_verification','Is your HACCP system verified by a competent person?','yesnona',null,false,null,4050),

-- Section 5: Premises & Environment
('5','Premises & Environment','5_premises_condition','Is the site and building maintained in a good state of repair?','yesnona',null,false,null,5010),
('5','Premises & Environment','5_pest_control','Is there a documented and active pest control programme in place?','yesnona',null,false,null,5020),
('5','Premises & Environment','5_pest_records','Are pest control visits recorded and reviewed?','yesnona',null,false,null,5030),
('5','Premises & Environment','5_waste_management','Is there a documented waste management procedure?','yesnona',null,false,null,5040),
('5','Premises & Environment','5_water_quality','Is the water used in production potable / tested regularly?','yesnona',null,false,null,5050),

-- Section 6: Equipment & Maintenance
('6','Equipment & Maintenance','6_maintenance','Is there a documented preventive maintenance programme for food contact equipment?','yesnona',null,false,null,6010),
('6','Equipment & Maintenance','6_calibration','Is measuring and monitoring equipment calibrated at defined intervals?','yesnona',null,false,null,6020),
('6','Equipment & Maintenance','6_calibration_records','Are calibration records maintained?','yesnona',null,false,null,6030),
('6','Equipment & Maintenance','6_breakdowns','Are equipment breakdown/repair records maintained?','yesnona',null,false,null,6040),

-- Section 7: Staff Hygiene & Welfare
('7','Staff Hygiene & Welfare','7_welfare','Are adequate staff welfare facilities provided (toilets, changing, rest areas)?','yesnona',null,false,null,7010),
('7','Staff Hygiene & Welfare','7_handwashing','Are hand-washing facilities available at all critical points in production?','yesnona',null,false,null,7020),
('7','Staff Hygiene & Welfare','7_hygiene_policy','Do you have a documented personal hygiene policy for all food handlers?','yesnona',null,false,null,7030),
('7','Staff Hygiene & Welfare','7_illness_reporting','Is there a procedure for reporting illness and exclusion of food handlers?','yesnona',null,false,null,7040),
('7','Staff Hygiene & Welfare','7_visitor_control','Are visitor hygiene requirements enforced?','yesnona',null,false,null,7050),

-- Section 8: Contamination Control
('8','Contamination Control','8_glass_policy','Do you have a glass and brittle plastic policy?','yesnona',null,false,null,8010),
('8','Contamination Control','8_foreign_body','Do you have a foreign body detection / control procedure?','yesnona',null,false,null,8020),
('8','Contamination Control','8_metal_detection','Is metal detection or X-ray equipment used where appropriate?','yesnona',null,false,null,8030),
('8','Contamination Control','8_colour_coding','Is colour-coded equipment used to prevent cross-contamination?','yesnona',null,false,null,8040),
('8','Contamination Control','8_chemicals','Are cleaning chemicals and food-grade chemicals stored separately from food?','yesnona',null,false,null,8050),

-- Section 9: Allergen Management (raw_material suppliers only)
('9','Allergen Management','9_allergen_policy','Do you have a documented allergen management policy?','yesnona',null,false,ARRAY['raw_material'],9010),
('9','Allergen Management','9_allergen_risk','Have you completed an allergen risk assessment for all products?','yesnona',null,false,ARRAY['raw_material'],9020),
('9','Allergen Management','9_allergen_labelling','Are allergens correctly declared on product labels and/or specifications?','yesnona',null,false,ARRAY['raw_material'],9030),
('9','Allergen Management','9_allergen_cleaning','Do you have allergen-specific cleaning procedures to prevent cross-contact?','yesnona',null,false,ARRAY['raw_material'],9040),
('9','Allergen Management','9_allergen_segregation','Are allergenic ingredients physically segregated during storage and production?','yesnona',null,false,ARRAY['raw_material'],9050),
('9','Allergen Management','9_allergen_training','Are all relevant staff trained in allergen awareness?','yesnona',null,false,ARRAY['raw_material'],9060),

-- Section 10: Product Integrity & Specifications
('10','Product Integrity & Specifications','10_specs','Do you have up-to-date written product specifications for all products supplied to us?','yesnona',null,false,null,10010),
('10','Product Integrity & Specifications','10_testing','Do you conduct microbiological and/or chemical product testing?','yesnona',null,false,null,10020),
('10','Product Integrity & Specifications','10_testing_freq','If yes, how frequently is testing carried out?','text','e.g. Every batch, monthly, annually',false,null,10030),
('10','Product Integrity & Specifications','10_shelf_life','Are shelf-life / durability studies carried out and documented?','yesnona',null,false,null,10040),
('10','Product Integrity & Specifications','10_labelling','Do your products comply with applicable food labelling legislation?','yesnona',null,false,null,10050),

-- Section 11: Cleaning & Housekeeping
('11','Cleaning & Housekeeping','11_cleaning_schedule','Do you have a documented cleaning schedule for all food contact surfaces and equipment?','yesnona',null,false,null,11010),
('11','Cleaning & Housekeeping','11_cleaning_verified','Is the effectiveness of cleaning verified (e.g. swabbing, visual inspection)?','yesnona',null,false,null,11020),
('11','Cleaning & Housekeeping','11_cleaning_records','Are cleaning records maintained?','yesnona',null,false,null,11030),
('11','Cleaning & Housekeeping','11_detergents','Are cleaning chemicals approved for use in a food environment?','yesnona',null,false,null,11040),

-- Section 12: Process Controls & Traceability
('12','Process Controls & Traceability','12_process_controls','Do you have documented process controls (e.g. temperature, time, pH)?','yesnona',null,false,null,12010),
('12','Process Controls & Traceability','12_monitoring_records','Are process monitoring records maintained and reviewed?','yesnona',null,false,null,12020),
('12','Process Controls & Traceability','12_traceability','Can you trace all raw materials from receipt through to finished product despatch?','yesnona',null,false,null,12030),
('12','Process Controls & Traceability','12_traceability_test','Do you conduct traceability exercises to verify your system?','yesnona',null,false,null,12040),
('12','Process Controls & Traceability','12_batch_coding','Are all products batch-coded to allow traceability?','yesnona',null,false,null,12050),

-- Section 13: Transport & Storage
('13','Transport & Storage','13_storage_conditions','Are raw materials and finished goods stored under appropriate conditions (temp, humidity)?','yesnona',null,false,null,13010),
('13','Transport & Storage','13_temp_monitoring','Are storage temperatures monitored and recorded?','yesnona',null,false,null,13020),
('13','Transport & Storage','13_vehicle_hygiene','Are delivery vehicles maintained in a clean and hygienic condition?','yesnona',null,false,null,13030),
('13','Transport & Storage','13_delivery_checks','Are incoming deliveries inspected and documented?','yesnona',null,false,null,13040),
('13','Transport & Storage','13_fifo','Is a FIFO (first in, first out) system applied to stock rotation?','yesnona',null,false,null,13050),

-- Section 14: Training & Personnel
('14','Training & Personnel','14_training_records','Are documented training records maintained for all food handlers?','yesnona',null,false,null,14010),
('14','Training & Personnel','14_food_hygiene_training','Have all food handlers received appropriate food hygiene training?','yesnona',null,false,null,14020),
('14','Training & Personnel','14_training_refreshed','Is training refreshed at regular intervals or when practices change?','yesnona',null,false,null,14030),
('14','Training & Personnel','14_management_training','Has management received advanced food safety / HACCP training?','yesnona',null,false,null,14040),

-- Section 15: GM & Irradiated Products (raw_material suppliers only)
('15','Genetically Modified & Irradiated Products','15_gm','Do any of the products you supply contain or are derived from genetically modified organisms (GMOs)?','yesnona',null,false,ARRAY['raw_material'],15010),
('15','Genetically Modified & Irradiated Products','15_gm_detail','If yes, please provide details','text','Which products and which GM ingredient',false,ARRAY['raw_material'],15020),
('15','Genetically Modified & Irradiated Products','15_irradiated','Have any of the products you supply been treated with ionising radiation?','yesnona',null,false,ARRAY['raw_material'],15030),
('15','Genetically Modified & Irradiated Products','15_irradiated_detail','If yes, please provide details','text',null,false,ARRAY['raw_material'],15040),

-- Section 16: Declaration
('16','Declaration','16_declaration_name','Full name of person completing this questionnaire','text',null,true,null,16010),
('16','Declaration','16_declaration_position','Job title / position','text',null,true,null,16020),
('16','Declaration','16_declaration_date','Date','date',null,true,null,16030),
('16','Declaration','16_additional_info','Any additional information you would like to share','textarea','Optional',false,null,16040);
