"""Initial schema — all tables

Revision ID: 0001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('role', sa.Enum('student', 'lecturer', 'admin', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    op.create_table('student_profiles',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('student_number', sa.String(), nullable=False),
        sa.Column('programme', sa.String(), nullable=False),
        sa.Column('year_of_study', sa.Integer(), nullable=False),
        sa.Column('ses_status', sa.Enum('low', 'middle', 'high', name='sesstatus'), nullable=True),
        sa.Column('is_scholarship', sa.Boolean(), nullable=True),
        sa.Column('is_employed_part_time', sa.Boolean(), nullable=True),
        sa.Column('distance_from_campus_km', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )
    op.create_index('ix_student_profiles_student_number', 'student_profiles', ['student_number'], unique=True)

    op.create_table('courses',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('credits', sa.Integer(), nullable=True),
        sa.Column('semester', sa.Integer(), nullable=False),
        sa.Column('academic_year', sa.String(), nullable=False),
        sa.Column('lecturer_id', sa.String(), nullable=True),
        sa.Column('total_classes', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['lecturer_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )

    op.create_table('attendance_records',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('course_id', sa.String(), nullable=False),
        sa.Column('week_number', sa.Integer(), nullable=False),
        sa.Column('classes_held', sa.Integer(), nullable=True),
        sa.Column('classes_attended', sa.Integer(), nullable=True),
        sa.Column('lms_logins', sa.Integer(), nullable=True),
        sa.Column('assignment_submissions', sa.Integer(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id']),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('assessments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('course_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('assessment_type', sa.String(), nullable=False),
        sa.Column('max_marks', sa.Float(), nullable=True),
        sa.Column('weight_percent', sa.Float(), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('assessment_results',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('assessment_id', sa.String(), nullable=False),
        sa.Column('marks_obtained', sa.Float(), nullable=True),
        sa.Column('submitted_on_time', sa.Boolean(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['assessment_id'], ['assessments.id']),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('risk_predictions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('risk_level', sa.Enum('low', 'medium', 'high', 'critical', name='risklevel'), nullable=False),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('predicted_gpa', sa.Float(), nullable=True),
        sa.Column('top_risk_factors', sa.Text(), nullable=True),
        sa.Column('model_version', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('interventions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('intervention_type', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('recommended_by', sa.String(), nullable=True),
        sa.Column('is_actioned', sa.Boolean(), nullable=True),
        sa.Column('outcome_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('actioned_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('interventions')
    op.drop_table('risk_predictions')
    op.drop_table('assessment_results')
    op.drop_table('assessments')
    op.drop_table('attendance_records')
    op.drop_table('courses')
    op.drop_index('ix_student_profiles_student_number', table_name='student_profiles')
    op.drop_table('student_profiles')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
    op.execute("DROP TYPE IF EXISTS risklevel")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("DROP TYPE IF EXISTS sesstatus")
