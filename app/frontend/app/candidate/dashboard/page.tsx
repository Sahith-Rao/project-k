'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CandidateNavbar from '@/components/candidate-navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  MapPin, 
  DollarSign, 
  Calendar, 
  Briefcase,
  Filter,
  ExternalLink,
  FileText,
  Clock,
  CheckCircle,
  Building,
  Wallet
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCandidateStats } from '../applications/page';

interface Job {
  _id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  jobType?: string;
  experience?: string;
  description: string;
  requirements?: string;
  benefits?: string;
  lastDate?: string;
  skillsRequired?: string[];
  createdAt?: string;
}

interface Application {
  _id: string;
  job: {
    _id: string;
    title: string;
    company: string;
    location: string;
    salary: string;
    description: string;
    interviewStatus?: string;
    status?: string;
  };
  resumeScore: number;
  appliedAt: string;
  status: 'Applied' | 'Shortlisted' | 'Not Qualified' | 'Reviewing' | 'Interview Expired' | 'Selected' | 'Not Selected';
  shortlisted: boolean;
  interviewStatus?: string;
}

export default function CandidateDashboard() {
  const [candidateData, setCandidateData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<'all' | 'title' | 'company' | 'location'>('all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const userType = localStorage.getItem('userType');
    const storedCandidateData = localStorage.getItem('candidateData');
    if (userType !== 'candidate' || !storedCandidateData) {
      router.push('/candidate/login');
      return;
    }
    const parsedData = JSON.parse(storedCandidateData);
    setCandidateData(parsedData);
    fetchApplications(parsedData._id);
    fetchAppliedJobs(parsedData._id);
  }, [router]);

  useEffect(() => {
    fetch('http://localhost:5000/api/jobs/candidate')
      .then(res => res.json())
      .then(data => setJobs(data))
      .catch(err => console.error(err));
  }, []);

  const fetchApplications = (candidateId: string) => {
    fetch(`${API_URL}/api/applications/candidate/${candidateId}`)
      .then(res => res.json())
      .then((data: Application[]) => {
        if (Array.isArray(data)) setApplications(data);
      })
      .catch(err => console.error('Failed to fetch applications', err));
  };

  const fetchAppliedJobs = (candidateId: string) => {
    fetch(`${API_URL}/api/applications/candidate/${candidateId}`)
      .then(res => res.json())
      .then((applications: any[]) => {
        const jobIds = new Set(applications.map(app => app.job._id.toString()));
        setAppliedJobIds(jobIds);
      })
      .catch(err => console.error('Failed to fetch applications', err));
  };

  const handleApplyClick = (job: Job) => {
    if (appliedJobIds.has(job._id)) {
      toast.error('You have already applied for this job');
      return;
    }
    setSelectedJob(job);
    setIsApplying(true);
  };

  const handleResumeSubmit = async () => {
    if (!resumeFile || !selectedJob || !selectedJob.description) return;
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('jobDescription', selectedJob.description);
    formData.append('candidateId', candidateData._id);
    formData.append('jobId', selectedJob._id);
    try {
      const res = await fetch('http://localhost:5000/api/analyze/resume', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error('Resume analysis failed');
      }
      const { score, application } = await res.json();
      setAppliedJobIds(prev => new Set(prev).add(application.job));
      if (candidateData?._id) fetchAppliedJobs(candidateData._id);
      const newApplication = {
        jobId: selectedJob._id,
        jobTitle: selectedJob.title,
        company: selectedJob.company,
        appliedDate: new Date().toISOString().split('T')[0],
        status: application?.status || 'Applied',
        score: score,
        applicationId: application?._id,
      };
      const existingApplications = JSON.parse(localStorage.getItem('candidateApplications') || '[]');
      const updatedApplications = [...existingApplications, newApplication];
      localStorage.setItem('candidateApplications', JSON.stringify(updatedApplications));
      toast.success(`Successfully applied for ${selectedJob.title}!`);
      setIsApplying(false);
      setResumeFile(null);
      setSelectedJob(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to apply. Please try again.');
    }
    setIsSubmitting(false);
  };

  const availableJobs = jobs.filter(job => !appliedJobIds.has(job._id.toString()));

  const filteredJobs = availableJobs.filter(job => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    if (searchField === 'all') {
      return (
        job.title.toLowerCase().includes(term) ||
        job.company.toLowerCase().includes(term) ||
        job.location.toLowerCase().includes(term)
      );
    } else if (searchField === 'title') {
      return job.title.toLowerCase().includes(term);
    } else if (searchField === 'company') {
      return job.company.toLowerCase().includes(term);
    } else if (searchField === 'location') {
      return job.location.toLowerCase().includes(term);
    }
    return true;
  });

  const stats = getCandidateStats(applications);

  if (!candidateData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <CandidateNavbar />
      <div className="pt-16">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {candidateData.firstName}!
            </h1>
            <p className="text-gray-600 mt-2">Find and apply for jobs that match your skills</p>
          </div>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex-1 text-left">
                  <CardTitle className="text-sm font-medium opacity-90">Total Applications</CardTitle>
                </div>
                <FileText className="h-4 w-4 opacity-90 ml-2" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs opacity-90">Jobs applied to</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex-1 text-left">
                  <CardTitle className="text-sm font-medium opacity-90">Pending Review</CardTitle>
                </div>
                <Clock className="h-4 w-4 opacity-90 ml-2" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pending}</div>
                <p className="text-xs opacity-90">Awaiting response</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex-1 text-left">
                  <CardTitle className="text-sm font-medium opacity-90">Interviews</CardTitle>
                </div>
                <Calendar className="h-4 w-4 opacity-90 ml-2" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.interviews}</div>
                <p className="text-xs opacity-90">Scheduled</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex-1 text-left">
                  <CardTitle className="text-sm font-medium opacity-90">Accepted</CardTitle>
                </div>
                <CheckCircle className="h-4 w-4 opacity-90 ml-2" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.accepted}</div>
                <p className="text-xs opacity-90">Job offers</p>
              </CardContent>
            </Card>
          </div>
          {/* Search and Filters */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-grow w-full">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by title, company, or location"
                    className="pl-10"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-full">
                  {(['all', 'title', 'company', 'location'] as const).map(field => (
                    <Button
                      key={field}
                      variant="ghost"
                      size="sm"
                      className={`rounded-full capitalize px-4 py-1 h-auto text-sm ${
                        searchField === field
                          ? 'bg-purple-600 text-white hover:bg-purple-700'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                      onClick={() => setSearchField(field)}
                    >
                      {field}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Job Listings */}
          <div className="space-y-6">
            {filteredJobs.map((job) => (
              <Card key={job._id} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 mb-4 md:mb-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900 mb-1">{job.title}</h3>
                          <p className="text-lg text-gray-700 font-medium">{job.company}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="secondary">
                          <MapPin className="w-4 h-4 mr-1 inline" /> {job.location}
                        </Badge>
                        <Badge variant="secondary">
                          <span className="flex items-center gap-1"><Wallet className="w-4 h-4 mr-1 inline" /> {job.salary}</span>
                        </Badge>
                        {job.jobType && (
                          <Badge variant="secondary">
                            <Briefcase className="w-4 h-4 mr-1 inline" /> {job.jobType}
                          </Badge>
                        )}
                        {job.experience && (
                          <Badge variant="secondary">
                            <Calendar className="w-4 h-4 mr-1 inline" /> {job.experience}
                          </Badge>
                        )}
                      </div>
                      {job.skillsRequired && job.skillsRequired.length > 0 && (
                        <div className="mb-2">
                          <span className="font-medium text-gray-700">Skills Required: </span>
                          {job.skillsRequired.map((skill, idx) => (
                            <Badge key={idx} variant="outline" className="ml-1">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-gray-700 mb-2">{job.description}</p>
                      {job.requirements && (
                        <div className="mb-2">
                          <span className="font-medium text-gray-700">Requirements: </span>
                          {job.requirements}
                        </div>
                      )}
                      {job.benefits && (
                        <div className="mb-2">
                          <span className="font-medium text-gray-700">Benefits: </span>
                          {job.benefits}
                        </div>
                      )}
                      {job.lastDate && (
                        <div className="mb-2">
                          <span className="font-medium text-gray-700">Apply By: </span>
                          {job.lastDate}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-4">
                      <Button
                        variant="default"
                        onClick={() => handleApplyClick(job)}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <Dialog open={isApplying} onOpenChange={setIsApplying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for {selectedJob?.title}</DialogTitle>
            <DialogDescription>
              Upload your resume to apply for this position. Our AI will analyze it against the job description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="resume" className="block text-sm font-medium text-gray-700">
                Resume (PDF)
              </label>
              <Input
                id="resume"
                type="file"
                accept=".pdf"
                onChange={(e) => setResumeFile(e.target.files ? e.target.files[0] : null)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApplying(false)}>Cancel</Button>
            <Button
              onClick={handleResumeSubmit}
              disabled={isSubmitting || !resumeFile}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                  Submitting...
                </span>
              ) : (
                'Submit Application'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {openJobId && (
        <Dialog open={!!openJobId} onOpenChange={() => setOpenJobId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{jobs.find(job => job._id === openJobId)?.title}</DialogTitle>
              <DialogDescription>
                {jobs.find(job => job._id === openJobId)?.company}
              </DialogDescription>
            </DialogHeader>
            <div className="mb-2 text-gray-700">
              {jobs.find(job => job._id === openJobId)?.description || 'No description available.'}
            </div>
            <div className="flex gap-4 text-sm text-gray-600">
              <span><MapPin className="inline w-4 h-4 mr-1" />{jobs.find(job => job._id === openJobId)?.location}</span>
              <span><span className="flex items-center gap-1"><Wallet className="w-4 h-4 mr-1 inline" /> {jobs.find(job => job._id === openJobId)?.salary}</span></span>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}